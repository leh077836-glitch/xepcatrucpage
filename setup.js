// Run locally before deploying. Never commit the generated .setup/ directory.
const fs=require('node:fs'),path=require('node:path'),{randomBytes,pbkdf2Sync,createHmac}=require('node:crypto');
const admin=process.env.SETUP_ADMIN_PASSWORD,viewer=process.env.SETUP_VIEWER_PASSWORD;
if(typeof admin!=='string'||admin.length<12||admin.length>200||typeof viewer!=='string'||viewer.length<8||viewer.length>200||admin===viewer)throw Error('Cần hai mật khẩu khác nhau: SETUP_ADMIN_PASSWORD (12+ ký tự), SETUP_VIEWER_PASSWORD (8+ ký tự).');
const out=path.join(__dirname,'.setup');if(fs.existsSync(out))throw Error('.setup đã tồn tại. Không chạy lại với database đang dùng; đổi mật khẩu qua web.');
fs.mkdirSync(out,{mode:0o700});const pepper=randomBytes(32).toString('hex'),quote=x=>"'"+String(x).replace(/'/g,"''")+"'";
const sql=[fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8')];
for(const [role,password] of [['admin',admin],['viewer',viewer]]){const salt=randomBytes(16).toString('hex'),proof=pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex'),encoded=createHmac('sha256',pepper).update(role+':'+proof).digest('hex');sql.push('INSERT INTO credentials(role,salt,password_hash) VALUES ('+[role,salt,encoded].map(quote).join(',')+');');}
const seed=fs.readFileSync(path.join(__dirname,'seed.json'),'utf8');sql.push('INSERT INTO schedule VALUES (1,1,'+quote(seed)+','+quote(new Date().toISOString())+",'Khởi tạo lịch');");
fs.writeFileSync(path.join(out,'init.sql'),sql.join('\n'),{mode:0o600});fs.writeFileSync(path.join(out,'pepper-secret.txt'),pepper,{mode:0o600});console.log('Đã tạo .setup/init.sql và secret riêng. Không chia sẻ hoặc đưa .setup vào Git.');
