import {beforeEach,describe,it,expect,vi} from 'vitest';
const {student}=vi.hoisted(()=>({student:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/features/student/data',()=>({student}));
import {studentClassWorkspace} from '@/features/student/class-workspace-data';
const id='44444444-4444-4444-8444-444444444444';
beforeEach(()=>vi.clearAllMocks());
describe('student private class boundary',()=>{
 it('stops all lesson, resource and contact reads when membership is not accepted',async()=>{
  const from=vi.fn();student.mockResolvedValue({id:'student',db:{rpc:vi.fn(async()=>({data:null,error:null})),from}});
  expect(await studentClassWorkspace('en',id,{view:'teacher'})).toBeNull();expect(from).not.toHaveBeenCalled();
 });
 it('reports an overview lookup failure instead of treating access as accepted',async()=>{
  const from=vi.fn();student.mockResolvedValue({id:'student',db:{rpc:vi.fn(async()=>({data:null,error:{message:'unavailable'}})),from}});
  await expect(studentClassWorkspace('ar',id,{view:'materials'})).rejects.toThrow('Student class could not be loaded');expect(from).not.toHaveBeenCalled();
 });
});
