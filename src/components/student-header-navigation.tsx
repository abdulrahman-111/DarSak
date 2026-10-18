'use client';
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';
import {hasAdminWorkspaceNavigation,hasStudentWorkspaceNavigation,hasTeacherWorkspaceNavigation} from './navigation-domain';
/** Workspace pages already have the complete role navigation. */
export function StudentHeaderNavigation({locale,enabled,children,role='student'}:{locale:string;enabled:boolean;children:ReactNode;role?:'student'|'teacher'|'admin'}){
 const pathname=usePathname()??'';
 const hasWorkspaceNavigation=role==='teacher'?hasTeacherWorkspaceNavigation(pathname,locale):role==='admin'?hasAdminWorkspaceNavigation(pathname,locale):hasStudentWorkspaceNavigation(pathname,locale);
 return enabled&&hasWorkspaceNavigation?null:<>{children}</>;
}
