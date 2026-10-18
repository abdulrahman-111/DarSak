'use client';
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';
import {hasStudentWorkspaceNavigation} from './navigation-domain';
/** Workspace pages already have the complete student navigation. */
export function StudentHeaderNavigation({locale,enabled,children}:{locale:string;enabled:boolean;children:ReactNode}){
 const pathname=usePathname();
 return enabled&&hasStudentWorkspaceNavigation(pathname,locale)?null:<>{children}</>;
}
