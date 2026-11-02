-- Cờ Thủ Nhí — schema Supabase cho phòng chơi 2 bé.
-- Chạy toàn bộ file này trong Supabase → SQL Editor → Run. Chạy lại nhiều lần vẫn an toàn.
--
-- Nguyên tắc: bảng `rooms` bật RLS, người chơi chỉ ĐỌC được phòng của mình.
-- Mọi thao tác ghi đi qua các hàm bên dưới (security definer), nên client không
-- thể tự sửa phòng của người khác hay tự đặt điểm.

create table if not exists public.rooms (
  code         text primary key check (code ~ '^[A-Z0-9]{4}$'),
  host_id      uuid not null,
  guest_id     uuid,
  host_name    text not null,
  host_avatar  text not null,
  guest_name   text,
  guest_avatar text,
  set_id       text not null default 'ngau-nhien' check (set_id ~ '^[a-z-]{1,30}$'),
  seed         text not null,
  status       text not null default 'waiting'
               check (status in ('waiting', 'lobby', 'playing', 'finished')),
  host_ready   boolean not null default false,
  guest_ready  boolean not null default false,
  started_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Thời gian mỗi câu (giây) do chủ phòng chọn. `add column if not exists` để chạy lại được trên DB cũ.
alter table public.rooms
  add column if not exists question_seconds int not null default 10
  check (question_seconds in (5, 10, 15));

create index if not exists rooms_host_id_idx on public.rooms (host_id);
create index if not exists rooms_created_at_idx on public.rooms (created_at);

alter table public.rooms enable row level security;

drop policy if exists "members can read their room" on public.rooms;
create policy "members can read their room" on public.rooms
  for select to authenticated
  using (auth.uid() = host_id or auth.uid() = guest_id);

-- Client chỉ được đọc; không có policy insert/update/delete nên mọi ghi trực tiếp bị từ chối.
revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;

-- ---------------------------------------------------------------------------
-- Tạo phòng: sinh mã 4 ký tự (bỏ O/0/I/1/L cho dễ đọc), bé tạo là chủ phòng.
-- ---------------------------------------------------------------------------
create or replace function public.create_room(p_name text, p_avatar text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := left(btrim(coalesce(p_name, '')), 12);
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_room     public.rooms;
  v_try      int := 0;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;

  -- Dọn phòng cũ của chính bé này (trừ phòng đang chơi).
  delete from public.rooms where host_id = v_uid and status <> 'playing';

  loop
    select string_agg(
             substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 4);
    begin
      insert into public.rooms (code, host_id, host_name, host_avatar, seed)
      values (v_code, v_uid, v_name, left(coalesce(p_avatar, ''), 8), gen_random_uuid()::text)
      returning * into v_room;
      return v_room;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'NO_FREE_CODE'; end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vào phòng bằng mã. Lỗi: ROOM_NOT_FOUND, ROOM_FULL, ROOM_CLOSED.
-- ---------------------------------------------------------------------------
create or replace function public.join_room(p_code text, p_name text, p_avatar text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 12);
  v_room public.rooms;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;

  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  -- Chủ phòng hoặc bé đã vào rồi: vào lại bình thường.
  if v_room.host_id = v_uid or v_room.guest_id = v_uid then return v_room; end if;

  if v_room.guest_id is not null then raise exception 'ROOM_FULL'; end if;
  if v_room.status in ('playing', 'finished') then raise exception 'ROOM_CLOSED'; end if;

  update public.rooms
     set guest_id = v_uid,
         guest_name = v_name,
         guest_avatar = left(coalesce(p_avatar, ''), 8),
         status = 'lobby'
   where code = v_room.code
  returning * into v_room;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chủ phòng chọn bộ cờ (id trong src/data/flag-sets.json hoặc 'ngau-nhien').
-- ---------------------------------------------------------------------------
create or replace function public.set_room_set(p_code text, p_set_id text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if p_set_id is null or p_set_id !~ '^[a-z-]{1,30}$' then raise exception 'BAD_SET'; end if;

  update public.rooms
     set set_id = p_set_id, host_ready = false, guest_ready = false
   where code = upper(btrim(p_code))
     and host_id = auth.uid()
     and status in ('waiting', 'lobby')
  returning * into v_room;

  if not found then raise exception 'NOT_ALLOWED'; end if;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chủ phòng chọn thời gian mỗi câu: 5, 10 hoặc 15 giây.
-- ---------------------------------------------------------------------------
create or replace function public.set_room_seconds(p_code text, p_seconds int)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  if p_seconds is null or p_seconds not in (5, 10, 15) then raise exception 'BAD_SECONDS'; end if;

  update public.rooms
     set question_seconds = p_seconds, host_ready = false, guest_ready = false
   where code = upper(btrim(p_code))
     and host_id = auth.uid()
     and status in ('waiting', 'lobby')
  returning * into v_room;

  if not found then raise exception 'NOT_ALLOWED'; end if;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bấm "Sẵn sàng". Khi cả hai sẵn sàng: đổi seed mới và chuyển sang 'playing'.
-- ---------------------------------------------------------------------------
create or replace function public.set_ready(p_code text, p_ready boolean)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found
     or (v_uid is distinct from v_room.host_id and v_uid is distinct from v_room.guest_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_room.status <> 'lobby' then raise exception 'NOT_ALLOWED'; end if;

  if v_uid = v_room.host_id then
    v_room.host_ready := p_ready;
  else
    v_room.guest_ready := p_ready;
  end if;

  if v_room.host_ready and v_room.guest_ready then
    v_room.status := 'playing';
    v_room.seed := gen_random_uuid()::text;
    v_room.started_at := now();
  end if;

  update public.rooms
     set host_ready = v_room.host_ready,
         guest_ready = v_room.guest_ready,
         status = v_room.status,
         seed = v_room.seed,
         started_at = v_room.started_at
   where code = v_room.code
  returning * into v_room;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kết thúc trận, và "Chơi lại" (đưa phòng về phòng chờ với seed mới).
-- ---------------------------------------------------------------------------
create or replace function public.finish_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  update public.rooms
     set status = 'finished'
   where code = upper(btrim(p_code))
     and status = 'playing'
     and auth.uid() in (host_id, guest_id)
  returning * into v_room;

  if not found then
    select * into v_room from public.rooms
     where code = upper(btrim(p_code)) and auth.uid() in (host_id, guest_id);
    if not found then raise exception 'NOT_ALLOWED'; end if;
  end if;
  return v_room;
end;
$$;

create or replace function public.reset_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
begin
  update public.rooms
     set status = 'lobby',
         host_ready = false,
         guest_ready = false,
         seed = gen_random_uuid()::text,
         started_at = null
   where code = upper(btrim(p_code))
     and status = 'finished'
     and auth.uid() in (host_id, guest_id)
  returning * into v_room;

  if not found then
    select * into v_room from public.rooms
     where code = upper(btrim(p_code)) and auth.uid() in (host_id, guest_id);
    if not found then raise exception 'NOT_ALLOWED'; end if;
  end if;
  return v_room;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rời phòng: chủ phòng rời thì xóa phòng; bé thứ hai rời thì phòng về 'waiting'.
-- ---------------------------------------------------------------------------
create or replace function public.leave_room(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(btrim(p_code)) for update;
  if not found then return; end if;

  if v_room.host_id = v_uid then
    delete from public.rooms where code = v_room.code;
  elsif v_room.guest_id = v_uid then
    update public.rooms
       set guest_id = null, guest_name = null, guest_avatar = null,
           host_ready = false, guest_ready = false,
           status = 'waiting', started_at = null
     where code = v_room.code;
  end if;
end;
$$;

-- Chỉ người đã đăng nhập (kể cả ẩn danh) mới gọi được các hàm.
revoke execute on function public.create_room(text, text) from public, anon;
revoke execute on function public.join_room(text, text, text) from public, anon;
revoke execute on function public.set_room_set(text, text) from public, anon;
revoke execute on function public.set_room_seconds(text, int) from public, anon;
revoke execute on function public.set_ready(text, boolean) from public, anon;
revoke execute on function public.finish_room(text) from public, anon;
revoke execute on function public.reset_room(text) from public, anon;
revoke execute on function public.leave_room(text) from public, anon;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.set_room_set(text, text) to authenticated;
grant execute on function public.set_room_seconds(text, int) to authenticated;
grant execute on function public.set_ready(text, boolean) to authenticated;
grant execute on function public.finish_room(text) to authenticated;
grant execute on function public.reset_room(text) to authenticated;
grant execute on function public.leave_room(text) to authenticated;

-- Bật Realtime cho bảng rooms (RLS vẫn áp dụng: mỗi bé chỉ nhận thay đổi của phòng mình).
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then
  null;
end;
$$;
