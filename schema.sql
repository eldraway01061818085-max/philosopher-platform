-- Run the entire file in Supabase SQL Editor.
-- Re-runnable schema for the starter platform. Review policies before production use.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text, phone text, grade text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(), title text not null, grade text not null,
  price numeric(10,2) not null default 0 check (price >= 0), active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade, receipt_path text not null,
  transfer_reference text, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz
);
-- Permit a new request after a previous request was rejected, while preventing concurrent active requests.
alter table public.subscriptions drop constraint if exists subscriptions_student_id_course_id_key;
create unique index if not exists subscriptions_one_active_per_course
  on public.subscriptions(student_id, course_id) where status in ('pending','approved');
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  title text not null, video_url text not null, sort_order int not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  score numeric(6,2) not null check (score >= 0), total numeric(6,2) not null check (total > 0 and score <= total),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles(id, full_name, email, phone, grade)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email,
         new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'grade')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.subscriptions enable row level security;
alter table public.lessons enable row level security;
alter table public.quiz_results enable row level security;

-- Drop/recreate named policies so this script can be safely rerun.
drop policy if exists "profiles read self or admin" on public.profiles;
drop policy if exists "profiles update self" on public.profiles;
drop policy if exists "active courses visible" on public.courses;
drop policy if exists "admin manages courses" on public.courses;
drop policy if exists "student reads own subscriptions" on public.subscriptions;
drop policy if exists "student requests own subscription" on public.subscriptions;
drop policy if exists "admin reviews subscriptions" on public.subscriptions;
drop policy if exists "approved lessons or admin" on public.lessons;
drop policy if exists "admin manages lessons" on public.lessons;
drop policy if exists "student reads own results" on public.quiz_results;
drop policy if exists "student inserts own results" on public.quiz_results;
drop policy if exists "admin reads results" on public.quiz_results;

grant usage on schema public to anon, authenticated;
grant select on public.courses to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.subscriptions to authenticated;
grant select, insert, update, delete on public.courses, public.lessons to authenticated;
grant select, insert on public.quiz_results to authenticated;

create policy "profiles read self or admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
-- Column-level grants prevent a student from changing role or account ownership fields.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, grade) on public.profiles to authenticated;
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "active courses visible" on public.courses for select to anon, authenticated
  using (active or public.is_admin());
create policy "admin manages courses" on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "student reads own subscriptions" on public.subscriptions for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin());
create policy "student requests own subscription" on public.subscriptions for insert to authenticated
  with check (student_id = (select auth.uid()) and status = 'pending');
create policy "admin reviews subscriptions" on public.subscriptions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "approved lessons or admin" on public.lessons for select to authenticated
  using (public.is_admin() or exists(select 1 from public.subscriptions s where s.course_id = lessons.course_id and s.student_id = (select auth.uid()) and s.status = 'approved'));
create policy "admin manages lessons" on public.lessons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "student reads own results" on public.quiz_results for select to authenticated
  using (student_id = (select auth.uid()) or public.is_admin());
create policy "student inserts own results" on public.quiz_results for insert to authenticated
  with check (student_id = (select auth.uid()) and score <= total);
create policy "admin reads results" on public.quiz_results for select to authenticated using (public.is_admin());

-- Private receipt bucket; 5 MB upload limit and accepted content types.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];
drop policy if exists "student uploads own receipt" on storage.objects;
drop policy if exists "student reads own receipt and admin reads all" on storage.objects;
drop policy if exists "student deletes own unlinked receipt" on storage.objects;
create policy "student uploads own receipt" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "student reads own receipt and admin reads all" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- Promote only the teacher's trusted account manually after registering:
-- update public.profiles set role = 'admin' where email = 'YOUR_LOGIN_EMAIL';
-- Never grant admin access to a student account.
