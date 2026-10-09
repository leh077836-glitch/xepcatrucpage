// Build script embeds the shared UI and scheduling core above this file.
const textEncoder=new TextEncoder();
const hex=buffer=>Array.from(new Uint8Array(buffer),v=>v.toString(16).padStart(2,'0')).join('');
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',textEncoder.encode(value)));
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const equal=(a,b)=>{if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
async function proofHash(env,role,proof){if(typeof env.PASSWORD_PEPPER!=='string'||env.PASSWORD_PEPPER.trim().length<32)fail(503,'Web chưa được cấu hình mật khẩu.');const key=await crypto.subtle.importKey('raw',textEncoder.encode(env.PASSWORD_PEPPER.trim()),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,textEncoder.encode(role+':'+proof)));}
async function body(request){if(Number(request.headers.get('content-length'))>700000)fail(413,'Dữ liệu quá lớn.');const reader=request.body?.getReader();if(!reader)fail(400,'Thiếu dữ liệu.');let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>700000){await reader.cancel();fail(413,'Dữ liệu quá lớn.');}chunks.push(value);}let bytes=new Uint8Array(size),offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Dữ liệu không hợp lệ.');}}
const namesValid=n=>Array.isArray(n)&&n.length===8&&n.every(x=>typeof x==='string'&&x.trim().length>0&&x.trim().length<=40)&&new Set(n.map(x=>x.trim().toLowerCase())).size===8;
export default {
 async fetch(request,env){
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000'});
  const json=(status,value)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(value),{status,headers});};
  const html=source=>{const nonce=random(18);headers.set('Content-Type','text/html; charset=utf-8');headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);return new Response(source.replace(/<script>/g,'<script nonce="'+nonce+'">'),{headers});};
  try{
   const url=new URL(request.url),route=url.pathname,db=env.DB;
   const origin=()=>{if(request.headers.get('Origin')!==url.origin)fail(403,'Yêu cầu không đến từ trang web này.');};
   const cookie=(v,age)=>'pageops_session='+v+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;
   const readState=async()=>{const row=await db.prepare('SELECT * FROM schedule WHERE id=1').first();if(!row)fail(503,'Cần khởi tạo cơ sở dữ liệu.');return {...JSON.parse(row.data),revision:row.revision,updatedAt:row.updated_at};};
   if(route==='/healthz'&&request.method==='GET')return json(200,{ok:true});
   if(route==='/login'&&request.method==='GET')return html(LOGIN_HTML);
   if(route==='/api/login-config'&&request.method==='GET'){const {results}=await db.prepare('SELECT role,salt FROM credentials').all();return json(200,{salts:Object.fromEntries(results.map(r=>[r.role,r.salt])),iterations:600000});}
   if(route==='/api/login'&&request.method==='POST'){
    origin();const input=await body(request);if(!['admin','viewer'].includes(input.role)||typeof input.proof!=='string'||!/^[a-f0-9]{64}$/.test(input.proof))fail(400,'Nhập mật khẩu hợp lệ.');
    const now=Date.now(),key=await digest((request.headers.get('CF-Connecting-IP')||'local')+':'+input.role),attempt=await db.prepare('SELECT * FROM attempts WHERE key=?').bind(key).first();
    if(attempt&&attempt.until>now&&attempt.count>=8)fail(429,'Sai mật khẩu nhiều lần. Thử lại sau 10 phút.');
    const credential=await db.prepare('SELECT password_hash FROM credentials WHERE role=?').bind(input.role).first();if(!credential)fail(503,'Chưa khởi tạo mật khẩu.');
    if(!equal(await proofHash(env,input.role,input.proof),credential.password_hash)){await db.prepare('INSERT INTO attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN attempts.until>? THEN attempts.count+1 ELSE 1 END,until=CASE WHEN attempts.until>? THEN attempts.until ELSE excluded.until END').bind(key,now+600000,now,now).run();fail(401,'Mật khẩu không đúng.');}
    const token=random(32),csrf=random(24);await db.batch([db.prepare('DELETE FROM attempts WHERE key=? OR until<=?').bind(key,now),db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await digest(token),input.role,csrf,now+28800000)]);headers.set('Set-Cookie',cookie(token,28800));return json(200,{role:input.role});
   }
   const cookiePart=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pageops_session=')),token=cookiePart?.slice(16);
   const auth=token&&/^[a-f0-9]{64}$/.test(token)?await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').bind(await digest(token),Date.now()).first():null;
   if(!auth){if(route==='/'&&request.method==='GET'){headers.set('Location','/login');return new Response(null,{status:302,headers});}fail(401,'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.');}
   if(route==='/'&&request.method==='GET')return html(APP_HTML);
   if(route==='/api/session'&&request.method==='GET')return json(200,{role:auth.role,csrf:auth.csrf,expires:auth.expires});
   if(route==='/api/schedule'&&request.method==='GET')return json(200,await readState());
   if(['POST','PUT','DELETE'].includes(request.method)){origin();if(request.headers.get('X-CSRF-Token')!==auth.csrf)fail(403,'Phiên thao tác không hợp lệ. Tải lại trang.');}
   if(route==='/api/logout'&&request.method==='POST'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.token_hash).run();headers.set('Set-Cookie',cookie('',0));return json(200,{ok:true});}
   if(route.startsWith('/api/')&&auth.role!=='admin')fail(403,'Nhân viên chỉ được xem lịch.');
   if(route==='/api/schedule'&&request.method==='PUT'){
    const input=await body(request);if(input.version!==3||!namesValid(input.names))fail(400,'Cần 8 tên khác nhau và lịch phiên bản 3.');let errors;try{errors=PageScheduler.validate(input.rows);}catch{fail(400,'Dữ liệu ca không hợp lệ.');}if(errors.length)fail(400,errors.slice(0,3).join(' '));if(!Number.isInteger(input.revision))fail(400,'Thiếu phiên bản lịch.');
    const clean={version:3,start:PageScheduler.START,end:PageScheduler.END,names:input.names.map(n=>n.trim()),rows:input.rows.map(r=>({date:r.date,shifts:r.shifts.slice()}))};
    const result=await db.prepare('UPDATE schedule SET revision=revision+1,data=?,updated_at=?,action=? WHERE id=1 AND revision=?').bind(JSON.stringify(clean),new Date().toISOString(),typeof input.action==='string'?input.action.slice(0,160):'Cập nhật lịch',input.revision).run();if(result.meta.changes!==1)fail(409,'Lịch đã được cập nhật ở phiên khác. Đã tải lịch mới; hãy thực hiện lại thay đổi.');return json(200,await readState());
   }
   if(route==='/api/history'&&request.method==='GET'){const {results}=await db.prepare('SELECT revision,action,updated_at FROM history ORDER BY id DESC LIMIT 30').all();return json(200,results);}
   if(route==='/api/password'&&request.method==='POST'){
    const input=await body(request);if(!['admin','viewer'].includes(input.role)||![/^[a-f0-9]{64}$/.test(input.newProof||''),/^[a-f0-9]{64}$/.test(input.currentProof||'')].every(Boolean))fail(400,'Mật khẩu không hợp lệ.');
    const admin=await db.prepare('SELECT password_hash FROM credentials WHERE role=?').bind('admin').first();if(!equal(await proofHash(env,'admin',input.currentProof),admin.password_hash))fail(403,'Mật khẩu quản lý hiện tại không đúng.');
    await db.batch([db.prepare('UPDATE credentials SET password_hash=? WHERE role=?').bind(await proofHash(env,input.role,input.newProof),input.role),db.prepare('DELETE FROM sessions WHERE role=? AND token_hash<>?').bind(input.role,auth.token_hash)]);return json(200,{ok:true});
   }
   fail(404,'Không tìm thấy trang.');
  }catch(e){return json(e.status||500,{error:e.status?e.message:'Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại.'});}
 }
};
