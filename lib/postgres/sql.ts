/** Closed compatibility surface for Harimu's existing SQLite dialect.
 * SQL literals/comments are tokenized before transformation; values stay bound.
 */
export function sqlTokens(sql:string):string[]{
 const parts=sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\/|\s+|[A-Za-z_][\w]*|\d+(?:\.\d+)?|\?|[^\s]/g)??[];
 if(parts.join('')!==sql)throw Error('Unsupported SQL token.');return parts;
}
function functions(tokens:string[],previousChanges:number):string{
 let out='';
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i],name=token.toLowerCase();let next=i+1;while(/^\s+$/.test(tokens[next]??''))next++;
  if(/^[a-z_]\w*$/i.test(token)&&tokens[next]==='('){
   let depth=1,end=next+1;for(;end<tokens.length;end++){if(tokens[end]==='(')depth++;if(tokens[end]===')'&&!--depth)break;}
   if(depth!==0)throw Error('Unbalanced SQL function.');
   const inside=tokens.slice(next+1,end);const args:string[][]=[[]];let nested=0;for(const part of inside){if(part==='(')nested++;if(part===')')nested--;if(part===','&&nested===0)args.push([]);else args.at(-1)!.push(part);}
   const values=args.map(arg=>functions(arg,previousChanges));let expression=`${token}(${values.join(',')})`;
   if((name==='min'||name==='max')&&args.length>1)expression=`${name==='min'?'LEAST':'GREATEST'}(${values.join(',')})`;
   if(name==='changes'){if(inside.some(t=>t.trim()))throw Error('Unsupported changes arguments.');expression=String(previousChanges);}
   if(name==='julianday')expression=`harimu_compat.julianday(${values.join(',')})`;
   if(name==='typeof')expression=`harimu_compat.sqlite_typeof(${values.join(',')})`;
   if(name==='strftime'){if(args.length!==2||values[0].trim()!=="'%s'")throw Error('Unsupported SQLite date format.');expression=`harimu_compat.unix_seconds(${values[1]})`;}
   if(name==='json_object')expression=`jsonb_build_object(${values.join(',')})`;
   if(name==='json_group_array')expression=`COALESCE(jsonb_agg(${values.join(',')}),'[]'::jsonb)::text`;
   if(name==='json_valid')expression=`harimu_compat.json_valid(${values.join(',')})`;
   if(name==='json_array_length')expression=`jsonb_array_length((${values.join(',')})::jsonb)`;
   if(name==='json_extract'){
    if(args.length!==2)throw Error('Unsupported JSON path.');const path=values[1].trim();const match=path.match(/^'\$\[(\d+)\]\.decision\.(proposedSpendMinor|topic)'$/);if(!match)throw Error('Unsupported JSON path.');
    expression=`((${values[0]})::jsonb #>> '{${match[1]},decision,${match[2]}}')${match[2]==='proposedSpendMinor'?'::bigint':''}`;
   }
   if(name==='cast'){const text=values[0];const match=text.match(/^([\s\S]+)\s+AS\s+INTEGER\s*$/i);if(match)expression=`trunc((${match[1]})::numeric)::bigint`;}
   out+=expression;i=end;
  }else out+=token;
 }
 return out;
}
export function postgresSql(sql:string,values:unknown[]=[],previousChanges=0):{text:string;values:unknown[]}{
 const tokens=sqlTokens(sql).map(token=>token.startsWith('`')?'"'+token.slice(1,-1).replaceAll('``','`').replaceAll('"','""')+'"':token);if(tokens.some(t=>t===';'||t.startsWith('--')||t.startsWith('/*')))throw Error('Only a single uncommented SQL statement is allowed.');
 if(/^\s*PRAGMA\s+optimize\s*$/i.test(sql))return {text:'SELECT 1',values:[]};
 const pragma=sql.match(/^\s*PRAGMA\s+table_info\((\w+)\)\s*$/i);if(pragma)return {text:"SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",values:[pragma[1]]};
 let ordinal=0;const bound:unknown[]=[];
 const replaced=tokens.map(token=>{if(token!=='?')return token;const value=values[ordinal++];if(value===undefined)throw Error('Missing SQL parameter.');bound.push(value);if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Database parameters must be safe whole numbers.');return `$${ordinal}${typeof value==='number'?'::bigint':typeof value==='string'?'::text':''}`;});
 if(ordinal!==values.length)throw Error('Unexpected SQL parameter.');
 let text=functions(replaced,previousChanges);
 const ignore=/^\s*INSERT\s+OR\s+IGNORE\s/i.test(text);text=text.replace(/^\s*INSERT\s+OR\s+IGNORE\s/i,'INSERT ');
 if(ignore){if(/\bON\s+CONFLICT\b/i.test(text))throw Error('Ambiguous conflict policy.');text+=' ON CONFLICT DO NOTHING';}
 if(/^\s*CREATE\s+VIEW\s+IF\s+NOT\s+EXISTS\s/i.test(text))text=text.replace(/CREATE\s+VIEW\s+IF\s+NOT\s+EXISTS/i,'CREATE OR REPLACE VIEW');
 // SQLITE INTEGER/BLOB and WITHOUT ROWID appear only in schema statements.
 if(/^\s*(CREATE|ALTER)\s/i.test(text)){
  text=text.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi,'BIGSERIAL PRIMARY KEY').replace(/\s+WITHOUT\s+ROWID\s*$/i,'');
  text=sqlTokens(text).map(token=>/^INTEGER$/i.test(token)?'BIGINT':/^BLOB$/i.test(token)?'BYTEA':/^TEXT$/i.test(token)?'TEXT COLLATE "C"':token).join('');
 }
 return {text,values:bound};
}
