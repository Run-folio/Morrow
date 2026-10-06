import pg from 'pg';
const schema=process.env.BATCH14_TEST_SCHEMA;
if(!process.env.MORROVIA_TEST_DATABASE_URL || process.env.MORROVIA_TEST_DATABASE_DISPOSABLE!=='1' || !schema || !/^batch14_[a-z0-9_]+$/.test(schema)) throw new Error('An explicitly disposable Batch14 database/schema is required.');
const pool=new pg.Pool({connectionString:process.env.MORROVIA_TEST_DATABASE_URL});
type Query={text:string;values:unknown[]};
const build=(parts:TemplateStringsArray,values:unknown[]):Query=>({text:parts.reduce((text,part,index)=>text+(index?`$${index}`:'')+part,''),values});
async function connect(){const client=await pool.connect();await client.query(`set search_path to "${schema}", public`);return client;}
export function getEasyTDatabase(){
 const query=async(parts:TemplateStringsArray,...values:unknown[])=>{const client=await connect();try{return (await client.query(build(parts,values))).rows;}finally{client.release();}};
 const transaction=async(callback:(tx:(parts:TemplateStringsArray,...values:unknown[])=>Query)=>Query[])=>{
  const client=await connect();try{
   await client.query('begin');const results=[];
   for(const statement of callback((parts,...values)=>build(parts,values)))results.push((await client.query(statement)).rows);
   await client.query('commit');return results;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 return Object.assign(query,{transaction});
}
export async function closeBatch14Database(){await pool.end();}
