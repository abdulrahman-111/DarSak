'use server';
import {redirect} from 'next/navigation';
import type {Locale} from './domain';
import {enrollmentAction,type ActionState} from './actions';
export async function leaveStudentClass(locale:Locale,enrollmentId:string,state:ActionState):Promise<ActionState>{
 const result=await enrollmentAction(locale,'cancel',enrollmentId,state);
 if(result?.success)redirect(`/${locale}/student/classes?cancelled=1`);
 return result;
}
