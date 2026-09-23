begin;
insert into public.education_nodes(id,parent_id,kind,name_ar,name_en,slug) values
('00000000-0000-0000-0000-000000000001',null,'system','الثانوية العامة المصرية','Egyptian National','national'),
('00000000-0000-0000-0000-000000000002',null,'system','البكالوريا الدولية والبريطانية','IG / British','ig-british'),
('00000000-0000-0000-0000-000000000003',null,'system','التعليم الجامعي','University','university'),
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','level','المرحلة الثانوية','Secondary School','national-secondary'),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','level','مرحلة IG والبكالوريا','IG and British Secondary','ig-secondary'),
('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000003','university','جامعة عامة','General University','general-university'),
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011','grade','الصف الثالث الثانوي','Grade 12','national-grade-12'),
('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000012','grade','المستوى A','A Level','a-level'),
('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000013','year','السنة الأولى الجامعية','University Year 1','university-year-1')
on conflict(id) do update set parent_id=excluded.parent_id,kind=excluded.kind,name_ar=excluded.name_ar,name_en=excluded.name_en,slug=excluded.slug;
insert into public.subjects(id,name_ar,name_en,slug) values
('00000000-0000-0000-0000-000000000101','الرياضيات','Mathematics','mathematics'),
('00000000-0000-0000-0000-000000000102','الفيزياء','Physics','physics'),
('00000000-0000-0000-0000-000000000103','اللغة الإنجليزية','English Language','english-language')
on conflict(id) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,slug=excluded.slug;
insert into public.offerings(node_id,subject_id) values
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000102'),
('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000103')
on conflict(node_id,subject_id) do nothing;
insert into public.platform_settings(key,value) values('catalogue_version','"starter-2026"'::jsonb),('max_material_size_bytes','10485760'::jsonb)
on conflict(key) do update set value=excluded.value;
commit;
