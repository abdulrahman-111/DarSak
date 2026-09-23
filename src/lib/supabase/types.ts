export type Profile={id:string;full_name:string;role:'student'|'teacher'|'admin';status:'active'|'suspended';preferred_language:'ar'|'en'};
export type Teacher={id:string;full_name:string;headline:string|null;bio:string|null;avatar_path:string|null};
export type Group={id:string;teacher_id:string;offering_id:string;name:string;description:string;capacity:number;status:'draft'|'published'|'archived';location:string;created_at:string; teacher?:Teacher; offering?:{id:string;subject?:{name_ar:string;name_en:string}}};
export type Slot={id:string;group_id:string;weekday:number;start_time:string;end_time:string;timezone:string};
export type Lesson={id:string;group_id:string;title:string;starts_at:string;ends_at:string;status:string;notes:string};
