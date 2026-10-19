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
 it('recovers an out-of-range lessons tab page without changing the class filter',async()=>{
  const lessonQueries:Array<{filters:Array<[string,string,unknown]>;range:[number,number]|null}>=[];
  const db={
   rpc:vi.fn(async()=>({data:{id,name:'Class',teacher_id:'teacher',enrollment_id:'enrollment',subject:{name_en:'Math',name_ar:'رياضيات'},category:{name_en:'School',name_ar:'مدرسة'},attendance:{present:0,late:0,absent:0,excused:0}},error:null})),
   from(table:string){
    const query={filters:[] as Array<[string,string,unknown]>,range:null as [number,number]|null};
    if(table==='lessons')lessonQueries.push(query);
    const builder:any={
     select:()=>builder,
     eq(column:string,value:unknown){query.filters.push(['eq',column,value]);return builder;},
     lt(column:string,value:unknown){query.filters.push(['lt',column,value]);return builder;},
     gte(column:string,value:unknown){query.filters.push(['gte',column,value]);return builder;},
     order:()=>builder,
     range(from:number,to:number){query.range=[from,to];return builder;},
     in:()=>builder,
     then(resolve:(value:unknown)=>unknown){
      if(table==='lessons'){
       const call=lessonQueries.length;
       if(call===1)return Promise.resolve(resolve({data:null,count:null,error:{code:'PGRST103',message:'Requested range not satisfiable'}}));
       return Promise.resolve(resolve({data:[{id:call===2?'first':'last'}],count:45,error:null}));
      }
      return Promise.resolve(resolve({data:[],error:null}));
     },
    };
    return builder;
   },
  };
  student.mockResolvedValue({id:'student',db});

  const result=await studentClassWorkspace('en',id,{view:'lessons',page:'9999'});

  expect(result).toMatchObject({page:3,total:45,pageCount:3,error:false,lessons:[{id:'last'}]});
  expect(lessonQueries.map(query=>query.range)).toEqual([[199960,199979],[0,19],[40,59]]);
  expect(lessonQueries[1].filters).toEqual(lessonQueries[0].filters);
  expect(lessonQueries[2].filters).toEqual(lessonQueries[0].filters);
  expect(lessonQueries[0].filters).toContainEqual(['eq','group_id',id]);
 });
});
