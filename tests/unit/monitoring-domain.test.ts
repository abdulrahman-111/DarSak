import {expect,it} from 'vitest';
import {safeOperationEvent} from '@/features/monitoring/domain';
it('emits only bounded categorical data',()=>{expect(safeOperationEvent('signup','bad',Infinity,{code:'secret@example.test'})).toEqual({operation:'signup',locale:'en',outcome:'failed',category:'provider',duration_ms:0});expect(safeOperationEvent('enrollment','ar',400000).duration_ms).toBe(300000);expect(safeOperationEvent('setup_save','en',4,{code:'PT409'}).category).toBe('conflict');});
