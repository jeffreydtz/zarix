// Route/Auth/Data API doubles only. This is not an actual JWT/RLS execution.
import {expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/services/investments',()=>({investmentsService:{update:vi.fn(),delete:vi.fn()}}));
import * as route from '@/app/api/investments/[id]/route';
it('provides the existing individual investment read endpoint',()=>{
 expect(typeof (route as Record<string,unknown>).GET).toBe('function');
});
