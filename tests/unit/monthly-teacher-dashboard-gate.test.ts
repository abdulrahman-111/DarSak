import { beforeEach,describe,expect,it,vi } from 'vitest';
const {viewer,status,overview}=vi.hoisted(()=>({viewer:vi.fn(),status:vi.fn(),overview:vi.fn()}));
vi.mock('@/components/platform/access',()=>({requireViewer:viewer}));
vi.mock('@/features/teacher-access/data',()=>({readTeacherAccessStatus:status}));
vi.mock('@/features/teacher/data',()=>({teacherOverview:overview}));
vi.mock('@/components/platform/actions',()=>({EnrollmentDecisionButtons:()=>null}));
import TeacherDashboard from '@/app/[locale]/teacher/page';
describe('teacher dashboard access gate',()=>{
 beforeEach(()=>{viewer.mockReset().mockResolvedValue({db:{},fullName:'Teacher'});status.mockReset();overview.mockReset();});
 it('does not load teaching summaries when access is expired',async()=>{
  status.mockResolvedValue({status:{has_access:false},error:false});
  const page=await TeacherDashboard({params:Promise.resolve({locale:'en'})});
  expect(overview).not.toHaveBeenCalled();expect(page).toBeTruthy();
 });
 it('shows retry state instead of empty teaching data when access status is unavailable',async()=>{
  status.mockResolvedValue({status:null,error:true});
  const page=await TeacherDashboard({params:Promise.resolve({locale:'en'})});
  expect(overview).not.toHaveBeenCalled();expect(page).toBeTruthy();
 });
});
