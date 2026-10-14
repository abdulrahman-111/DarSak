-- Roll this migration out only after the application calling
-- set_teacher_avatar_path has reached production. Until then the prior direct
-- avatar uploader remains compatible. The RPC migration is additive and must
-- be applied first.
revoke update (avatar_path) on public.teacher_profiles from authenticated;
