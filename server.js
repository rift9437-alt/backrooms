const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000, N = 31, CELL = 4, MAXP = 8, PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const HTML = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>THE BACKROOMS</title>\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>\nhtml,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:\"Courier New\",monospace;color:#e9e0a0}\ncanvas{display:block}\n#menu{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,8,0,.9);text-align:center;z-index:9}\nbutton,input{font:inherit;background:#2a2610;color:#e9e0a0;border:2px solid #6b5f2a;padding:8px 14px;margin:5px;cursor:pointer}input{cursor:text;width:230px}button:hover{border-color:#ffec70}#rooms{min-width:300px;margin:10px}#rooms div{margin:4px}\nh1{font-size:clamp(32px,7vw,64px);letter-spacing:.25em;margin:0 0 14px;text-shadow:0 0 22px #b9a63a}\n#menu p{margin:5px;opacity:.8}\n#hud{position:fixed;inset:0;pointer-events:none}\n#vig{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 35%,#a00 140%);opacity:0}\n#flash{position:fixed;inset:0;pointer-events:none;background:#a00;opacity:0;transition:opacity 1.2s}\n#bars{position:fixed;left:16px;bottom:16px;width:170px;font-size:12px}\n.bar{height:8px;background:#2a2610;margin:3px 0 8px;border:1px solid #6b5f2a}.bar i{display:block;height:100%;background:#d8c64a}\n#hot{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:6px}\n.slot{width:54px;height:54px;border:2px solid #6b5f2a;background:rgba(20,16,4,.7);display:flex;align-items:center;justify-content:center;font-size:26px;position:relative}\n.slot.sel{border-color:#ffec70;box-shadow:0 0 10px #b9a63a}.slot b{position:absolute;top:1px;left:4px;font-size:11px;opacity:.7}\n#prompt{position:fixed;top:58%;width:100%;text-align:center;text-shadow:0 0 6px #000}\n#toast{position:fixed;top:14%;width:100%;text-align:center;font-size:18px;text-shadow:0 0 6px #000}\n#info{position:fixed;top:10px;right:14px;font-size:12px;opacity:.8}\n#panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(15,12,3,.92);border:2px solid #6b5f2a;padding:16px 24px;display:none;min-width:300px}\n#panel h3{margin:0 0 8px}\n#cross{position:fixed;top:50%;left:50%;width:4px;height:4px;margin:-2px;background:#fff8;border-radius:50%}\n</style></head><body>\n<div id=\"menu\"><h1>THE BACKROOMS</h1>\n<div id=\"lobby\"><input id=\"nm\" maxlength=\"24\" placeholder=\"Lobby name (optional)\">\n<div><button id=\"solo\">Single Player</button><button id=\"mk\">Create Lobby</button><button id=\"rf\">Refresh</button></div>\n<div id=\"rooms\"></div><p id=\"st\"></p></div>\n<div id=\"pause\" style=\"display:none\"><p>WASD move \u00b7 SHIFT sprint \u00b7 E pick up \u00b7 1-6 use \u00b7 F flashlight \u00b7 I inventory \u00b7 hold RMB/Q badge</p>\n<p id=\"enter\" style=\"font-size:20px;cursor:pointer\">[ CLICK TO ENTER ]</p><button id=\"lv\">Leave</button></div></div>\n<div id=\"vig\"></div><div id=\"flash\"></div><div id=\"cross\"></div>\n<div id=\"hud\"><div id=\"info\"></div><div id=\"toast\"></div><div id=\"prompt\"></div>\n<div id=\"bars\">STAMINA<div class=\"bar\"><i id=\"bs\"></i></div>BATTERY<div class=\"bar\"><i id=\"bb\"></i></div>BADGE<div class=\"bar\"><i id=\"bg\"></i></div></div>\n<div id=\"hot\"></div><div id=\"panel\"></div></div>\n<script src=\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\"></script>\n<script>\nconst $=id=>document.getElementById(id);\nconst DEF={G:{n:'Security Badge',i:'\ud83e\udeaa',d:'Hold right mouse / Q. Forces shapeshifters to reveal and stuns them.'},W:{n:'Almond Water',i:'\ud83d\udca7',d:'Fully restores stamina.'},B:{n:'Battery',i:'\ud83d\udd0b',d:'Recharges your flashlight.'},F:{n:'Flashlight',i:'\ud83d\udd26',d:'Press F to toggle. Drains battery.'},L:{n:'Flare',i:'\ud83d\udd25',d:'Throw it. The entity goes to investigate.'}};\nconst H=3.4;let CELL=4,N=31,grid,myId,ready=false,ws;\nconst keys={},items=new Map(),others=new Map(),inv=Array(6).fill(null);\nlet sel=0,stamina=100,battery=100,flashOn=false,yaw=0,pitch=0,fear=0,bobT=0,mt=0,lastSend=0,flick=0;\nconst renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));\nrenderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);\nconst scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.05,60);\ncamera.rotation.order='YXZ';scene.add(camera);scene.background=new THREE.Color(0x14110a);scene.fog=new THREE.FogExp2(0x14110a,.075);\naddEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});\nconst amb=new THREE.AmbientLight(0xfff0b0,.4);scene.add(amb);\nconst lamp=new THREE.PointLight(0xffe9a0,.8,13);camera.add(lamp);\nconst spot=new THREE.SpotLight(0xfff4d0,0,24,.5,.6);spot.position.set(0,0,0);spot.target.position.set(0,0,-1);camera.add(spot,spot.target);\ncamera.position.set(4,1.65,4);\n\nfunction tex(fn,rep){const c=document.createElement('canvas');c.width=c.height=256;fn(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(rep)t.repeat.set(rep,rep);return t}\nconst noise=(x,n,a)=>{for(let i=0;i<n;i++){x.fillStyle=`rgba(0,0,0,${Math.random()*a})`;x.fillRect(Math.random()*256,Math.random()*256,2,2)}};\nconst wallT=tex(x=>{x.fillStyle='#c4b050';x.fillRect(0,0,256,256);for(let i=0;i<256;i+=32){x.fillStyle='rgba(120,100,20,.35)';x.fillRect(i,0,10,256);x.fillStyle='rgba(255,240,150,.15)';x.fillRect(i+14,0,3,256)}noise(x,3000,.25)});\nconst carpT=tex(x=>{x.fillStyle='#7b6c30';x.fillRect(0,0,256,256);noise(x,9000,.5)},0);\nconst ceilT=tex(x=>{x.fillStyle='#cfc8a0';x.fillRect(0,0,256,256);x.strokeStyle='#7a7450';x.lineWidth=4;x.strokeRect(0,0,256,256);noise(x,1500,.2)},0);\n\nfunction blocked(x,z){const cx=Math.round(x/CELL),cy=Math.round(z/CELL);return !grid[cy]||grid[cy][cx]!==0}\nfunction canAt(x,z){const r=.4;return!(blocked(x+r,z+r)||blocked(x-r,z+r)||blocked(x+r,z-r)||blocked(x-r,z-r))}\n\nlet panels,panelMat;\nfunction build(){\n  const walls=[],lights=[];\n  for(let y=0;y<N;y++)for(let x=0;x<N;x++){if(grid[y][x])walls.push([x,y]);else if((x+y)%3===0)lights.push([x,y])}\n  const wm=new THREE.InstancedMesh(new THREE.BoxGeometry(CELL,H,CELL),new THREE.MeshStandardMaterial({map:wallT,roughness:.95}),walls.length);\n  const m4=new THREE.Matrix4();walls.forEach(([x,y],i)=>{m4.setPosition(x*CELL,H/2,y*CELL);wm.setMatrixAt(i,m4)});scene.add(wm);\n  const S=N*CELL,mid=(N-1)/2*CELL;carpT.repeat.set(N*2,N*2);ceilT.repeat.set(N*2,N*2);\n  const fl=new THREE.Mesh(new THREE.PlaneGeometry(S,S).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:carpT,roughness:1}));fl.position.set(mid,0,mid);scene.add(fl);\n  const ce=new THREE.Mesh(new THREE.PlaneGeometry(S,S).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({map:ceilT,roughness:1}));ce.position.set(mid,H,mid);scene.add(ce);\n  panelMat=new THREE.MeshBasicMaterial({color:0xfffbe0});\n  panels=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.8,.8).rotateX(Math.PI/2),panelMat,lights.length);\n  lights.forEach(([x,y],i)=>{m4.setPosition(x*CELL,H-.02,y*CELL);panels.setMatrixAt(i,m4)});scene.add(panels);\n  mon=makeMonster();scene.add(mon.root);mon.root.visible=false;\n}\n\n// ---------- realistic models ----------\nfunction skinTex(base,vein){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=base;x.fillRect(0,0,256,256);\n  for(let i=0;i<2500;i++){x.fillStyle=`rgba(${Math.random()<.5?'60,40,40':'210,200,190'},${Math.random()*.12})`;x.beginPath();x.arc(Math.random()*256,Math.random()*256,Math.random()*6+1,0,7);x.fill()}\n  if(vein){x.strokeStyle=vein;for(let i=0;i<40;i++){x.beginPath();let a=Math.random()*256,b=Math.random()*256;x.moveTo(a,b);for(let k=0;k<8;k++){a+=Math.random()*30-15;b+=Math.random()*30-15;x.lineTo(a,b)}x.stroke()}}\n  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t}\nconst lathe=(pts,seg)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(Math.max(r,.002),y)),seg||18);\nconst limbGeo=(len,r0,r1,bulge,seg)=>{const p=[];for(let i=0;i<=12;i++){const t=i/12;p.push([r0+(r1-r0)*t+Math.sin(t*Math.PI)*bulge,-len*t])}return lathe(p,seg||14)};\nconst blob=(mat,rx,ry,rz,x,y,z,par)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),mat);m.scale.set(rx,ry,rz);m.position.set(x,y,z);par.add(m);return m};\nconst grp=(par,x,y,z)=>{const g=new THREE.Group();g.position.set(x,y,z);par.add(g);return g};\nconst part=(geo,mat,par,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);par.add(m);return m};\nconst DS=THREE.DoubleSide;\n\nfunction makeHuman(id){\n  const hue=(id*.37)%1,tones=[0xf1c9a5,0xd9a47b,0xa8744f,0x6f4a33,0xe8b998],hairs=[0x2b1b10,0x111111,0x7a5230,0xb8903c,0x3a3a3a];\n  const M=(c,r,s)=>new THREE.MeshStandardMaterial({color:c,roughness:r,side:s||THREE.FrontSide});\n  const skin=M(tones[id%5],.55),jacket=M(new THREE.Color().setHSL(hue,.45,.32),.85,DS),pants=M(0x232a38,.9,DS),shoe=M(0x101010,.5),hair=M(hairs[(id*3)%5],.8),white=M(0xf4f4f4,.3),iris=M(0x2a1a10,.3),lip=M(0x8a4a4a,.6);\n  const g=new THREE.Group(),m=grp(g,0,0,0);m.rotation.y=Math.PI;\n  const torso=part(lathe([[.15,.92],[.14,1.05],[.16,1.2],[.19,1.4],[.2,1.5],[.17,1.57],[.06,1.62]],24),jacket,m);torso.scale.z=.62;\n  blob(pants,.17,.11,.11,0,.95,0,m);part(lathe([[.055,1.55],[.05,1.68]],12),skin,m);\n  const head=grp(m,0,1.74,0);\n  blob(skin,.095,.12,.105,0,0,0,head);blob(skin,.07,.06,.08,0,-.07,.02,head);blob(skin,.015,.022,.025,0,-.01,.108,head);blob(lip,.024,.006,.01,0,-.05,.1,head);\n  for(const s of[-1,1]){blob(white,.017,.011,.008,s*.04,.02,.095,head);blob(iris,.008,.008,.006,s*.04,.02,.102,head);blob(skin,.012,.025,.016,s*.098,0,0,head)}\n  const hh=part(new THREE.SphereGeometry(1,24,16,0,Math.PI*2,0,Math.PI*.55),hair,head,0,.012,-.008);hh.scale.set(.1,.125,.112);\n  const arms=[],legs=[];\n  for(const s of[-1,1]){\n    const sh=grp(m,s*.22,1.52,0);blob(jacket,.06,.06,.06,0,0,0,sh);part(limbGeo(.3,.055,.045,.008),jacket,sh);\n    const el=grp(sh,0,-.3,0);blob(jacket,.047,.047,.047,0,0,0,el);part(limbGeo(.27,.045,.035,.006),jacket,el);blob(skin,.035,.05,.02,0,-.31,0,el);arms.push([sh,el]);\n    const hip=grp(m,s*.09,.95,0);part(limbGeo(.45,.085,.06,.012),pants,hip);\n    const kn=grp(hip,0,-.45,0);blob(pants,.06,.06,.06,0,0,0,kn);part(limbGeo(.45,.06,.04,.01),pants,kn);blob(shoe,.045,.035,.11,0,-.47,.04,kn);legs.push([hip,kn]);\n  }\n  const beam=new THREE.Mesh(new THREE.ConeGeometry(.7,3.5,12,1,true),new THREE.MeshBasicMaterial({color:0xfff4b0,transparent:true,opacity:.12,side:DS}));\n  beam.rotation.x=-Math.PI/2;beam.position.set(0,1.5,-1.9);beam.visible=false;g.add(beam);\n  return{g,arms,legs,beam,mt:0,tx:0,tz:0,ry:0}\n}\nfunction stepHuman(h,dt,tx,tz,ry){\n  const p=h.g.position,dx=tx-p.x,dz=tz-p.z,k=Math.min(1,dt*10);p.x+=dx*k;p.z+=dz*k;\n  const sp=Math.hypot(dx,dz)*k/Math.max(dt,.001);let d=ry-h.g.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));h.g.rotation.y+=d*Math.min(1,dt*12);\n  h.mt+=dt*Math.min(sp,7)*1.7;const a=Math.min(.75,sp*.16);\n  h.legs.forEach(([hp,kn],i)=>{const q=h.mt+i*Math.PI;hp.rotation.x=Math.sin(q)*a;kn.rotation.x=Math.max(0,Math.sin(q+1.6))*a*1.3});\n  h.arms.forEach(([sh,el],i)=>{const q=h.mt+i*Math.PI;sh.rotation.x=-Math.sin(q)*a*.8;el.rotation.x=-.2-Math.max(0,Math.sin(q))*a*.5});\n}\n\nlet mon;\nfunction makeMonster(o){o=o||{};\n  const tex=skinTex(o.skin||'#b3aca0','rgba(110,40,50,.5)');\n  const skin=new THREE.MeshStandardMaterial({map:tex,bumpMap:tex,bumpScale:.9,roughness:.8,color:o.tone||0xffffff,side:DS});\n  const dark=new THREE.MeshStandardMaterial({color:0x080505,roughness:.6}),tooth=new THREE.MeshStandardMaterial({color:0xd8d0b0,roughness:.4}),claw=new THREE.MeshStandardMaterial({color:0x1a1410,roughness:.3}),eyeM=new THREE.MeshBasicMaterial({color:o.eye||0xff2200});\n  const root=new THREE.Group(),body=grp(root,0,0,0);root.scale.setScalar(o.scale||1);\n  const tp=[];for(let i=0;i<=40;i++){const t=i/40;let r=.13+Math.sin(t*Math.PI)*.1+(t>.4?.03:0);if(t>.15&&t<.85)r+=Math.cos(t*60)*.008;if(t>.9)r*=1-(t-.9)*6;tp.push([r,1.2+t*1.5])}\n  part(lathe(tp,28),skin,body).scale.z=.62;\n  blob(skin,.2,.12,.12,0,1.25,0,body);\n  for(let i=0;i<9;i++)blob(skin,.025,.02,.025,0,1.35+i*.15,-.1,body);\n  part(lathe([[.06,2.6],[.04,2.8],[.05,2.98]],12),skin,body);\n  const head=grp(body,0,3.1,0),hg=new THREE.SphereGeometry(1,32,24),pa=hg.attributes.position;\n  for(let i=0;i<pa.count;i++){const x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i),n=1+.05*Math.sin(x*9+y*7)*Math.cos(z*8);pa.setXYZ(i,x*n,y*n,z*n)}hg.computeVertexNormals();\n  part(hg,skin,head).scale.set(.15,.27,.16);\n  for(const s of[-1,1]){blob(dark,.045,.055,.035,s*.06,.08,.13,head);blob(eyeM,.016,.016,.016,s*.06,.08,.155,head);blob(dark,.03,.07,.03,s*.1,-.02,.09,head);blob(dark,.008,.02,.01,s*.012,-.01,.158,head)}\n  blob(dark,.085,.06,.07,0,-.1,.1,head);\n  const jaw=grp(head,0,-.08,.02);blob(skin,.09,.06,.11,0,-.06,.07,jaw);\n  for(let i=0;i<9;i++){const a=(i/8-.5)*2.4,tx=Math.sin(a)*.08,tz=Math.cos(a)*.09;\n    const u=part(new THREE.ConeGeometry(.007,.045,5),tooth,head,tx,-.075,tz);u.rotation.x=Math.PI;\n    part(new THREE.ConeGeometry(.007,.045,5),tooth,jaw,tx,-.02,tz+.0)}\n  const arms=[],legs=[],fingers=[];\n  for(const s of[-1,1]){\n    const sh=grp(body,s*.28,2.6,0);blob(skin,.07,.07,.07,0,0,0,sh);part(limbGeo(1.15,.075,.05,.012),skin,sh);\n    const el=grp(sh,0,-1.15,0);blob(skin,.05,.05,.05,0,0,0,el);part(limbGeo(1.25,.05,.03,.01),skin,el);\n    const hand=grp(el,0,-1.25,0);blob(skin,.045,.06,.02,0,-.05,0,hand);\n    for(let k=0;k<4;k++){let par=grp(hand,(k-1.5)*.022,-.1,0);const js=[];\n      for(let n=0;n<3;n++){const L=[.17,.15,.13][n];part(limbGeo(L,.011-n*.002,.008-n*.002,0,6),skin,par);js.push(par);if(n<2)par=grp(par,0,-L,0);else part(new THREE.ConeGeometry(.006,.05,5),claw,par,0,-L-.02,0).rotation.x=Math.PI}\n      fingers.push(js)}\n    arms.push([sh,el,s]);\n    const hip=grp(root,s*.13,1.28,0);part(limbGeo(.7,.1,.06,.02),skin,hip);\n    const kn=grp(hip,0,-.7,0);blob(skin,.06,.06,.06,0,0,0,kn);part(limbGeo(.7,.06,.035,.01),skin,kn);blob(skin,.05,.035,.15,0,-.72,.07,kn);\n    for(let k=-1;k<=1;k++)part(new THREE.ConeGeometry(.012,.07,5),claw,kn,k*.025,-.72,.2).rotation.x=Math.PI/2;\n    legs.push([hip,kn]);\n  }\n  const l=new THREE.PointLight(o.eye||0xff3300,.5,8);l.position.y=2.8;root.add(l);\n  return{root,head,jaw,body,arms,legs,fingers,tx:0,tz:0,h:0,chase:0,init:false,mt:0};\n}\nfunction animCreature(m,dt){\n  if(!m.init)return;\n  const px=m.root.position.x,pz=m.root.position.z,k=Math.min(1,dt*8);\n  m.root.position.x+=(m.tx-px)*k;m.root.position.z+=(m.tz-pz)*k;\n  const moving=Math.hypot(m.tx-px,m.tz-pz)>.05;\n  let d=m.h-m.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));m.root.rotation.y+=d*Math.min(1,dt*6);\n  m.mt+=dt*(m.chase?10:4.5)*(moving?1:.2);const mt=m.mt,t=performance.now()/1000;\n  m.legs.forEach(([h,kn],i)=>{const p=mt+i*Math.PI;h.rotation.x=Math.sin(p)*.7;kn.rotation.x=Math.max(0,Math.sin(p+1.5))*.9});\n  m.arms.forEach(([sh,el,s],i)=>{sh.rotation.x=-Math.sin(mt+i*Math.PI)*.3-(m.chase?1.2:0);sh.rotation.z=s*(.08+Math.sin(t*3+i)*.04);el.rotation.x=-(m.chase?.5:.1)+Math.sin(t*9+i)*.05});\n  const curl=m.chase?.9:.35+Math.sin(t*4)*.1;m.fingers.forEach(f=>f.forEach((j,n)=>j.rotation.x=curl*(.5+n*.35)));\n  m.head.rotation.x=.45;m.head.rotation.z=Math.sin(t*2)*.12+(Math.random()<.04?(Math.random()-.5)*.6:0);\n  m.jaw.rotation.x=.25+Math.sin(t*3)*.08+(m.chase?.35+Math.sin(t*14)*.1:0);\n  m.body.position.y=Math.abs(Math.sin(mt))*.05;\n}\nconst animMonster=dt=>animCreature(mon,dt);\n\n// shapeshifters\nconst mimics=new Map();\nfunction syncMimics(list){\n  const seen=new Set();\n  for(const[id,x,z,h,copy,rev]of list){seen.add(id);let q=mimics.get(id);\n    if(!q){q={human:null,tc:null,copy:-1,rev:0};mimics.set(id,q)}\n    const c=copy||1;\n    if(q.copy!==c){if(q.human)scene.remove(q.human.g);q.human=makeHuman(c);q.human.g.position.set(x,0,z);scene.add(q.human.g);q.copy=c}\n    if(!q.tc){q.tc=makeMonster({tone:0xa9b8a0,scale:.9,eye:0xffb000});q.tc.root.position.set(x,0,z);q.tc.init=true;scene.add(q.tc.root)}\n    if(rev&&!q.rev&&Math.hypot(x-camera.position.x,z-camera.position.z)<16){burst(.4);toast('A shapeshifter!')}\n    q.rev=rev;q.tx=x;q.tz=z;q.h=h;q.human.g.visible=!rev;q.tc.root.visible=!!rev;q.tc.tx=x;q.tc.tz=z;q.tc.h=h;q.tc.chase=rev?1:0}\n  for(const[id,q]of mimics)if(!seen.has(id)){scene.remove(q.human.g,q.tc.root);mimics.delete(id)}\n}\n\n// security badge (held in front of the camera)\nconst badge=new THREE.Group();camera.add(badge);\n(function(){const c=document.createElement('canvas');c.width=256;c.height=360;const x=c.getContext('2d');\n  x.fillStyle='#e8e4d0';x.fillRect(0,0,256,360);x.fillStyle='#1b3a6b';x.fillRect(0,0,256,70);x.fillStyle='#fff';x.font='bold 30px Arial';x.textAlign='center';x.fillText('SECURITY',128,46);\n  x.fillStyle='#b8b09a';x.fillRect(78,95,100,120);x.fillStyle='#8a8272';x.beginPath();x.arc(128,135,24,0,7);x.fill();x.fillRect(98,165,60,50);\n  x.fillStyle='#222';x.font='20px monospace';x.fillText('LEVEL 0',128,250);x.fillText('AUTHORIZED',128,280);x.fillStyle='#c9a227';x.fillRect(0,330,256,30);\n  const t=new THREE.CanvasTexture(c);\n  part(new THREE.PlaneGeometry(.1,.14),new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.3}),badge,0,0,.003);\n  part(new THREE.BoxGeometry(.104,.144,.004),new THREE.MeshStandardMaterial({color:0xddd8c0}),badge);\n  part(new THREE.BoxGeometry(.008,.4,.002),new THREE.MeshStandardMaterial({color:0x111111}),badge,0,.27,0)})();\nlet badgeHeld=false,badgeCharge=100,mouseR=false;\nconst BP={idle:new THREE.Vector3(.2,-.34,-.5),up:new THREE.Vector3(0,-.01,-.34)};\n\n// ---------- network ----------\nfunction connect(){\n  const host=location.host||'localhost:3000';ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+host);\n  ws.onopen=()=>{$('st').textContent='';send({t:'list'})};\n  ws.onclose=()=>{$('st').textContent=location.host?'Disconnected \u2014 refresh the page.':'Cannot reach server. Run \"npm start\" and open http://localhost:3000'};\n  ws.onmessage=e=>{const m=JSON.parse(e.data);\n    if(m.t==='rooms')showRooms(m.rooms);else if(m.t==='err')$('st').textContent=m.msg;\n    else if(m.t==='w'){inRoom=true;$('lobby').style.display='none';$('pause').style.display='block';myId=m.id;N=m.N;CELL=m.CELL;grid=m.grid;build();m.items.forEach(addItem);inv[0]='G';drawInv();ready=true}\n    else if(m.t==='s'){mon.tx=m.m[0];mon.tz=m.m[1];mon.h=m.m[2];mon.chase=m.m[3];if(!mon.init){mon.init=true;mon.root.visible=true;mon.root.position.set(m.m[0],0,m.m[1])}\n      const seen=new Set();m.p.forEach(([id,x,z,ry,fl])=>{if(id===myId)return;seen.add(id);let o=others.get(id);if(!o){o=makePlayer(id);o.g.position.set(x,0,z);others.set(id,o)}o.tx=x;o.tz=z;o.ry=ry;o.beam.visible=!!fl});\n      for(const[id,o]of others)if(!seen.has(id)){scene.remove(o.g);others.delete(id)}\n      syncMimics(m.x||[]);$('info').textContent='Survivors: '+(m.p.length)}\n    else if(m.t==='item')addItem(m.it);\n    else if(m.t==='rm'){const it=items.get(m.id);if(it){scene.remove(it.mesh);items.delete(m.id)}}\n    else if(m.t==='got'){const i=inv.indexOf(null);if(i>=0){inv[i]=m.type;toast('Picked up '+DEF[m.type].n)}drawInv()}\n    else if(m.t==='caught')caught();\n  };\n}\nfunction makePlayer(id){const h=makeHuman(id);scene.add(h.g);return h}\nfunction addItem(it){\n  const c={W:0x66ccff,B:0x55ff66,F:0x555555,L:0xff3322}[it.type];\n  const geo=it.type==='W'?new THREE.BoxGeometry(.18,.4,.18):new THREE.CylinderGeometry(.1,.1,it.type==='F'?.5:.3,10);\n  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.6}));\n  mesh.position.set(it.cx*CELL,.9,it.cy*CELL);if(it.type==='F')mesh.rotation.z=1.2;scene.add(mesh);items.set(it.id,{...it,mesh});\n}\n\n// ---------- inventory ----------\nconst has=t=>inv.includes(t);\nfunction drawInv(){\n  $('hot').innerHTML=inv.map((t,i)=>`<div class=\"slot${i===sel?' sel':''}\"><b>${i+1}</b>${t?DEF[t].i:''}</div>`).join('');\n  $('panel').innerHTML='<h3>INVENTORY</h3>'+(inv.some(Boolean)?inv.map((t,i)=>t?`<div>${i+1}. ${DEF[t].i} <b>${DEF[t].n}</b> \u2014 ${DEF[t].d}</div>`:'').join(''):'<i>Empty.</i>');\n}\nfunction toast(s){const t=$('toast');t.textContent=s;clearTimeout(toast.t);toast.t=setTimeout(()=>t.textContent='',2200)}\nfunction useItem(i){\n  sel=i;const t=inv[i];if(t){\n    if(t==='W'){stamina=100;inv[i]=null;toast('Refreshing.')}\n    else if(t==='B'){if(has('F')){battery=100;inv[i]=null;toast('Flashlight recharged')}else toast('You need a flashlight')}\n    else if(t==='F')toggleFlash();\n    else if(t==='L'){throwFlare();inv[i]=null}\n    else if(t==='G')toast('Hold RIGHT MOUSE or Q to raise the badge')\n  }drawInv();\n}\nfunction toggleFlash(){if(!has('F'))return toast('You have no flashlight');if(battery<=0)return toast('Battery dead');flashOn=!flashOn}\nconst flares=[];\nfunction throwFlare(){\n  const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));let x=camera.position.x,z=camera.position.z;\n  for(let d=0;d<9;d+=.5){const nx=x+f.x*.5,nz=z+f.z*.5;if(blocked(nx,nz))break;x=nx;z=nz}\n  const l=new THREE.PointLight(0xff4422,1.6,14);l.position.set(x,.5,z);scene.add(l);\n  const m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.3,8),new THREE.MeshBasicMaterial({color:0xff6644}));m.position.set(x,.15,z);scene.add(m);\n  flares.push({l,m,t:12});ws.send(JSON.stringify({t:'flare',x,z}));toast('Flare thrown');\n}\nfunction caught(){\n  inv.fill(null);inv[0]='G';flashOn=false;battery=100;stamina=100;camera.position.set(4,1.65,4);drawInv();\n  const f=$('flash');f.style.transition='none';f.style.opacity=1;setTimeout(()=>{f.style.transition='opacity 1.5s';f.style.opacity=0},60);\n  burst(.6);toast('IT GOT YOU. You wake up where you started...');\n}\n\n// ---------- audio ----------\nlet AC,fearG;\nfunction audio(){if(AC)return;AC=new(window.AudioContext||window.webkitAudioContext)();\n  const mk=(f,ty,g)=>{const o=AC.createOscillator(),v=AC.createGain();o.type=ty;o.frequency.value=f;v.gain.value=g;o.connect(v);v.connect(AC.destination);o.start();return v};\n  mk(60,'sawtooth',.02);mk(120,'square',.006);mk(121.5,'sine',.012);fearG=mk(46,'sawtooth',0)}\nfunction burst(d){if(!AC)return;const b=AC.createBuffer(1,AC.sampleRate*d,AC.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);\n  const s=AC.createBufferSource(),g=AC.createGain();g.gain.value=.5;s.buffer=b;s.connect(g);g.connect(AC.destination);s.start()}\n\n// ---------- input ----------\nlet inRoom=false;\nfunction send(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o))}\nfunction showRooms(rs){const box=$('rooms');box.textContent='';if(!rs.length)box.textContent='No open lobbies \u2014 create one.';\n  rs.forEach(r=>{const d=document.createElement('div');d.append(r.name+' ('+r.n+'/'+r.max+')');const b=document.createElement('button');b.textContent='Join';b.onclick=()=>send({t:'join',id:r.id});d.append(b);box.append(d)})}\n$('solo').onclick=()=>send({t:'create',solo:true});\n$('mk').onclick=()=>send({t:'create',name:$('nm').value});\n$('rf').onclick=()=>send({t:'list'});\n$('lv').onclick=()=>{send({t:'leave'});location.reload()};\n$('enter').onclick=()=>{audio();if(AC.state==='suspended')AC.resume();renderer.domElement.requestPointerLock()};\ndocument.addEventListener('pointerlockchange',()=>{$('menu').style.display=document.pointerLockElement===renderer.domElement?'none':'flex'});\nconnect();\naddEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer.domElement)return;yaw-=e.movementX*.0022;pitch=Math.max(-1.4,Math.min(1.4,pitch-e.movementY*.0022))});\naddEventListener('keydown',e=>{keys[e.code]=true;if(!ready)return;\n  if(e.code==='KeyE'){let b=null,bd=2.4;for(const it of items.values()){const d=Math.hypot(it.cx*CELL-camera.position.x,it.cy*CELL-camera.position.z);if(d<bd){bd=d;b=it}}\n    if(b){if(inv.includes(null))ws.send(JSON.stringify({t:'pickup',id:b.id}));else toast('Inventory full')}}\n  if(e.code==='KeyF'){toggleFlash()}\n  if(e.code==='KeyI'||e.code==='Tab'){e.preventDefault();const p=$('panel');p.style.display=p.style.display==='block'?'none':'block'}\n  if(/^Digit[1-6]$/.test(e.code))useItem(+e.code[5]-1)});\naddEventListener('keyup',e=>keys[e.code]=false);\naddEventListener('mousedown',e=>{if(e.button===2)mouseR=true});addEventListener('mouseup',e=>{if(e.button===2)mouseR=false});addEventListener('contextmenu',e=>e.preventDefault());\n\n// ---------- loop ----------\nconst clock=new THREE.Clock();\nfunction update(dt){\n  const locked=document.pointerLockElement===renderer.domElement;\n  let f=locked?(keys.KeyW?1:0)-(keys.KeyS?1:0):0,s=locked?(keys.KeyD?1:0)-(keys.KeyA?1:0):0;\n  const moving=f||s,sprint=moving&&keys.ShiftLeft&&stamina>0;\n  stamina=Math.max(0,Math.min(100,stamina+(sprint?-22:12)*dt));\n  if(moving){const l=Math.hypot(f,s),sp=(sprint?6.2:3.4)*dt/l;\n    const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*sp,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*sp,p=camera.position;\n    if(canAt(p.x+dx,p.z))p.x+=dx;if(canAt(p.x,p.z+dz))p.z+=dz;bobT+=dt*(sprint?13:8)}\n  camera.position.y=1.65+(moving?Math.sin(bobT)*.045:0);camera.rotation.set(pitch,yaw,0);\n  if(flashOn){battery-=1.6*dt;if(battery<=0){battery=0;flashOn=false;toast('Flashlight died')}}\n  spot.intensity+=((flashOn?(battery<15&&Math.random()<.3?0.3:2.4):0)-spot.intensity)*Math.min(1,dt*20);\n  // monster + fear\n  const wantB=locked&&(keys.KeyQ||mouseR);\n  badgeHeld=wantB&&badgeCharge>(badgeHeld?0:20);badgeCharge=Math.max(0,Math.min(100,badgeCharge+(badgeHeld?-24:12)*dt));\n  const bt=badgeHeld?BP.up:BP.idle;badge.position.lerp(bt,Math.min(1,dt*12));badge.rotation.x+=((badgeHeld?0:.5)-badge.rotation.x)*Math.min(1,dt*12);badge.rotation.y+=((badgeHeld?0:-.4)-badge.rotation.y)*Math.min(1,dt*12);\n  animMonster(dt);\n  const md=mon.init?Math.hypot(mon.root.position.x-camera.position.x,mon.root.position.z-camera.position.z):99;\n  fear=Math.max(0,1-md/16);$('vig').style.opacity=fear*.8*(mon.chase?1:.5);\n  if(fearG)fearG.gain.value=fear*fear*.12;\n  flick-=dt;if(flick<=0){flick=Math.random()*(md<12?.15:2.5);const dim=Math.random()<(md<12?.6:.15)?.25+Math.random()*.3:1;amb.intensity=.4*dim;lamp.intensity=.8*dim;panelMat.color.setScalar(dim)}\n  // others\n  for(const o of others.values())stepHuman(o,dt,o.tx,o.tz,o.ry);\n  for(const q of mimics.values()){stepHuman(q.human,dt,q.tx,q.tz,q.h+Math.PI);animCreature(q.tc,dt)}\n  // items\n  const t=performance.now()/1000;let near=null,nd=2.4;\n  for(const it of items.values()){it.mesh.rotation.y+=dt;it.mesh.position.y=.9+Math.sin(t*2+it.id)*.08;\n    const d=Math.hypot(it.cx*CELL-camera.position.x,it.cy*CELL-camera.position.z);if(d<nd){nd=d;near=it}}\n  $('prompt').textContent=near?`[E] Pick up ${DEF[near.type].n}`:'';\n  for(let i=flares.length-1;i>=0;i--){const fl=flares[i];fl.t-=dt;fl.l.intensity=fl.t<2?fl.t*.8:1.6+Math.random()*.4;if(fl.t<=0){scene.remove(fl.l,fl.m);flares.splice(i,1)}}\n  $('bs').style.width=stamina+'%';$('bb').style.width=battery+'%';$('bg').style.width=badgeCharge+'%';\n  if(performance.now()-lastSend>66&&ws&&ws.readyState===1){lastSend=performance.now();ws.send(JSON.stringify({t:'pos',x:camera.position.x,z:camera.position.z,ry:yaw,fl:flashOn?1:0,b:badgeHeld?1:0}))}\n}\n(function loop(){requestAnimationFrame(loop);const dt=Math.min(.05,clock.getDelta());if(ready)update(dt);renderer.render(scene,camera)})();\n</script></body></html>\n";

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/' || p === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
  res.writeHead(404); res.end('404');
});

function genMaze() {
  const g = Array.from({ length: N }, () => Array(N).fill(1));
  const st = [[1, 1]]; g[1][1] = 0;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const d = D.map(([a, b]) => [a * 2, b * 2]).sort(() => Math.random() - .5)
      .filter(([a, b]) => { const nx = x + a, ny = y + b; return nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && g[ny][nx]; });
    if (!d.length) { st.pop(); continue; }
    const [a, b] = d[0]; g[y + b / 2][x + a / 2] = 0; g[y + b][x + a] = 0; st.push([x + a, y + b]);
  }
  for (let i = 0; i < 70; i++) g[1 + Math.random() * (N - 2) | 0][1 + Math.random() * (N - 2) | 0] = 0;
  for (let r = 0; r < 5; r++) {
    const x = 3 + Math.random() * (N - 8) | 0, y = 3 + Math.random() * (N - 8) | 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) g[y + b][x + a] = 0;
  }
  return g;
}

const bag = 'FBBBBBBWWWWWWLLLLLL';
let rid = 0, nid = 0;
const rooms = new Map();

function makeRoom(name, solo) {
  const g = genMaze(), opens = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if (!g[y][x]) opens.push([x, y]);
  const r = { id: ++rid, name, solo, g, opens, players: new Map(), items: new Map(), iid: 0, itemT: 0,
    mon: { x: 0, y: 0, h: 0, chase: 0, goal: null, lure: null, stun: 0 } };
  let far = opens[0]; for (let i = 0; i < 30; i++) { const c = r.opens[Math.random() * opens.length | 0]; if (c[0] + c[1] > far[0] + far[1]) far = c; }
  r.mon.x = far[0]; r.mon.y = far[1];
  for (let i = 0; i < 34; i++) spawnItem(r);
  r.mimics = [];
  for (let i = 0; i < 1; i++) { let c = pick(r); for (let k = 0; k < 25 && c[0] + c[1] < 24; k++) c = pick(r); r.mimics.push({ id: i + 1, x: c[0], y: c[1], h: 0, copy: 0, rev: 0, stun: 0, goal: null, fgoal: null, wake: Date.now() + 90000 + Math.random() * 120000 }); }
  rooms.set(r.id, r); return r;
}
const pick = r => r.opens[Math.random() * r.opens.length | 0];
const open = (r, x, y) => r.g[y] && r.g[y][x] === 0;
function spawnItem(r) {
  const [cx, cy] = pick(r); if (cx < 4 && cy < 4) return null;
  const it = { id: ++r.iid, type: bag[Math.random() * bag.length | 0], cx, cy };
  r.items.set(it.id, it); return it;
}
const bc = (r, o) => { const s = JSON.stringify(o); for (const p of r.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const list = () => ({ t: 'rooms', rooms: [...rooms.values()].filter(r => !r.solo && r.players.size < MAXP).map(r => ({ id: r.id, name: r.name, n: r.players.size, max: MAXP })) });

function bfs(r, sx, sy, tx, ty) {
  const S = sy * N + sx, T = ty * N + tx; if (S === T) return [tx, ty];
  const prev = new Int16Array(N * N).fill(-1); prev[S] = S; const q = [S];
  for (let i = 0; i < q.length; i++) {
    const c = q[i]; if (c === T) break; const x = c % N, y = c / N | 0;
    for (const [a, b] of D) { const nx = x + a, ny = y + b; if (open(r, nx, ny) && prev[ny * N + nx] < 0) { prev[ny * N + nx] = c; q.push(ny * N + nx); } }
  }
  if (prev[T] < 0) return null; let c = T; while (prev[c] !== S) c = prev[c]; return [c % N, c / N | 0];
}

function los(r, x1, z1, x2, z2) {
  const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.5);
  for (let i = 1; i < n; i++) { const t = i / n; if (!open(r, Math.round((x1 + (x2 - x1) * t) / CELL), Math.round((z1 + (z2 - z1) * t) / CELL))) return false; }
  return true;
}
function stepMimic(r, q, goal, sp, dt) {
  const nx = open(r, goal[0], goal[1]) ? bfs(r, Math.round(q.x), Math.round(q.y), goal[0], goal[1]) : null;
  if (!nx) return;
  const dx = nx[0] - q.x, dy = nx[1] - q.y, d = Math.hypot(dx, dy);
  if (d > 1e-3) { const s = Math.min(sp * dt, d) / d; q.x += dx * s; q.y += dy * s; q.h = Math.atan2(dx, dy); }
}
// Shapeshifters: look like a copy of a player, stalk and strike. A raised badge forces them to reveal, stunning them.
function tickMimics(r, now, dt) {
  const ps = [...r.players.values()];
  for (const q of r.mimics) {
    if (now < q.wake) continue;
    const wx = q.x * CELL, wz = q.y * CELL;
    for (const p of ps) {
      if (!p.badge) continue;
      const dx = wx - p.x, dz = wz - p.z, d = Math.hypot(dx, dz);
      if (d < 10 && d > .1 && (-Math.sin(p.ry) * dx - Math.cos(p.ry) * dz) / d > .5 && los(r, p.x, p.z, wx, wz)) {
        if (q.rev <= 0) { q.stun = 3.5; q.rev = 6; q.fgoal = null; } else { q.stun = Math.max(q.stun, .6); q.rev = Math.max(q.rev, 3); }
      }
    }
    if (q.rev > 0) q.rev -= dt;
    if (q.stun > 0) { q.stun -= dt; continue; }
    let tgt = null, best = 1e9;
    for (const p of ps) { const d = Math.hypot(p.x - wx, p.z - wz) / CELL; if (d < best) { best = d; tgt = p; } }
    if (q.rev > 0) {
      if (!q.fgoal || (Math.round(q.x) === q.fgoal[0] && Math.round(q.y) === q.fgoal[1])) {
        let b = null, bd = -1;
        for (let i = 0; i < 8; i++) { const c = pick(r), d = tgt ? Math.hypot(c[0] - tgt.x / CELL, c[1] - tgt.z / CELL) : 0; if (d > bd) { bd = d; b = c; } }
        q.fgoal = b;
      }
      stepMimic(r, q, q.fgoal, 1.5, dt);
    } else if (tgt && best < 22) {
      q.copy = tgt.id;
      stepMimic(r, q, [Math.round(tgt.x / CELL), Math.round(tgt.z / CELL)], .95, dt);
      if (best * CELL < 1.7 && now > tgt.safe) { tgt.safe = now + 5000; q.stun = 3; q.copy = 0; send(tgt.ws, { t: 'caught' }); }
    } else {
      if (!q.goal || (Math.round(q.x) === q.goal[0] && Math.round(q.y) === q.goal[1])) q.goal = pick(r);
      stepMimic(r, q, q.goal, .5, dt);
    }
  }
}
function leave(ws) {
  const r = ws.room; if (!r) return;
  r.players.delete(ws.pid); ws.room = null;
  if (!r.players.size) rooms.delete(r.id);
}
function join(ws, r) {
  if (r.players.size >= MAXP) return send(ws, { t: 'err', msg: 'Lobby full' });
  leave(ws);
  ws.pid = ++nid; ws.room = r;
  r.players.set(ws.pid, { id: ws.pid, x: 4, z: 4, ry: 0, fl: 0, safe: Date.now() + 5000, ws });
  send(ws, { t: 'w', id: ws.pid, N, CELL, grid: r.g, items: [...r.items.values()] });
}

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  send(ws, list());
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const r = ws.room, pl = r && r.players.get(ws.pid);
    if (m.t === 'list') send(ws, list());
    else if (m.t === 'create') join(ws, makeRoom(String(m.name || 'Lobby ' + (rid + 1)).replace(/[<>&"']/g, '').slice(0, 24), !!m.solo));
    else if (m.t === 'join') { const t = rooms.get(+m.id); if (t && !t.solo) join(ws, t); else send(ws, { t: 'err', msg: 'Lobby not found' }); }
    else if (m.t === 'leave') leave(ws);
    else if (!pl) return;
    else if (m.t === 'pos' && isFinite(m.x) && isFinite(m.z)) { pl.x = m.x; pl.z = m.z; pl.ry = +m.ry || 0; pl.fl = m.fl ? 1 : 0; pl.badge = m.b ? 1 : 0; }
    else if (m.t === 'pickup') {
      const it = r.items.get(m.id);
      if (it && Math.hypot(it.cx * CELL - pl.x, it.cy * CELL - pl.z) < 4.5) {
        r.items.delete(it.id); send(ws, { t: 'got', type: it.type }); bc(r, { t: 'rm', id: it.id });
      }
    } else if (m.t === 'flare') {
      const x = Math.round(m.x / CELL), y = Math.round(m.z / CELL);
      if (open(r, x, y)) r.mon.lure = { x, y, until: Date.now() + 9000 };
    }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  const dt = .05, now = Date.now();
  for (const r of rooms.values()) {
    const mon = r.mon;
    if (r.items.size < 28 && now > r.itemT) { r.itemT = now + 20000; const it = spawnItem(r); if (it) bc(r, { t: 'item', it }); }
    if (mon.stun > 0) mon.stun -= dt;
    else {
      let tgt = null, best = 1e9, chasing = 0;
      for (const p of r.players.values()) { const d = Math.hypot(p.x / CELL - mon.x, p.z / CELL - mon.y); if (d < best) { best = d; tgt = p; } }
      let goal;
      if (tgt && best < 13 && now > tgt.safe) { goal = [Math.round(tgt.x / CELL), Math.round(tgt.z / CELL)]; chasing = 1; }
      else if (mon.lure && now < mon.lure.until) goal = [mon.lure.x, mon.lure.y];
      else {
        if (!mon.goal || (Math.round(mon.x) === mon.goal[0] && Math.round(mon.y) === mon.goal[1])) mon.goal = pick(r);
        goal = mon.goal;
      }
      const nx = open(r, goal[0], goal[1]) ? bfs(r, Math.round(mon.x), Math.round(mon.y), goal[0], goal[1]) : null;
      if (nx) {
        const dx = nx[0] - mon.x, dy = nx[1] - mon.y, d = Math.hypot(dx, dy);
        if (d > 1e-3) { const s = Math.min((chasing ? 1.12 : .55) * dt, d) / d; mon.x += dx * s; mon.y += dy * s; mon.h = Math.atan2(dx, dy); }
      }
      mon.chase = chasing;
    }
    for (const p of r.players.values()) {
      if (now > p.safe && Math.hypot(p.x - mon.x * CELL, p.z - mon.y * CELL) < 1.7) {
        p.safe = now + 5000; mon.stun = 2.5; mon.chase = 0; send(p.ws, { t: 'caught' });
      }
    }
    tickMimics(r, now, dt);
    bc(r, { t: 's', x: r.mimics.filter(q => now >= q.wake).map(q => [q.id, q.x * CELL, q.y * CELL, q.h, q.copy, q.rev > 0 ? 1 : 0]), m: [mon.x * CELL, mon.y * CELL, mon.h, mon.chase], p: [...r.players.values()].map(p => [p.id, p.x, p.z, p.ry, p.fl]) });
  }
}, 50);

server.listen(PORT, () => console.log('Backrooms on :' + PORT));
