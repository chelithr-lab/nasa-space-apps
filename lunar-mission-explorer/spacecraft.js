const modelCanvas=document.getElementById('spacecraft');
const modelContext=modelCanvas.getContext('2d');
const metal='#b2c5df', dark='#53627b', gold='#c89a4a', solar='#426da9', white='#e9eef8';
let modelFaces=[], yaw=-.62, pitch=.28;
const models=[
  {pattern:/^Artemis (IV|V)$/,type:'lander',name:'Lunar landing system concept'},
  {pattern:/^Artemis [IV]+$/,type:'orion',name:'Orion spacecraft'},
  {pattern:/^Apollo (8|10|13)$/,type:'apollo',name:'Apollo command and service modules'},
  {pattern:/^Apollo/,type:'lm',name:'Apollo Lunar Module'},
  {pattern:/Blue Ghost/,type:'ghost',name:'Firefly Blue Ghost lander'},
  {pattern:/^IM-[1-4]$/,type:'nova',name:'Intuitive Machines Nova-C'},
  {pattern:/^Griffin/,type:'griffin',name:'Griffin lander'},
  {pattern:/^Blue Moon/,type:'blueMoon',name:'Blue Moon Mark 1 lander'},
  {pattern:/^Peregrine/,type:'lander',name:'Peregrine lander'},
  {pattern:/Hakuto-R|ispace Mission/i,type:'lander',name:'ispace lunar lander'},
  {pattern:/^Surveyor/,type:'surveyor',name:'Surveyor lander'},
  {pattern:/^Ranger/,type:'ranger',name:'Ranger probe'},
  {pattern:/^Lunokhod/,type:'lunokhod',name:'Lunokhod rover'},
  {pattern:/^Yutu$/,type:'rover',name:'Yutu rover'},
  {pattern:/^Chang'e [56]$/,type:'return',name:'Chang’e sample-return lander'},
  {pattern:/^Chandrayaan-3$/,type:'lander',name:'Vikram lander'},
  {pattern:/^Lunar Reconnaissance/,type:'lro',name:'Lunar Reconnaissance Orbiter'},
  {pattern:/^LunaH-Map|Lunar IceCube|LunIR|OMOTENASHI|EQUULEUS|CAPSTONE/,type:'cubesat',name:'CubeSat spacecraft'}
];
function createModel(type){
  const faces=[];
  function prism(x,y,z,rx,rz,h,color,n=8,top=1,angle=0){
    const ring=(level,ratio)=>Array.from({length:n},(_,i)=>{
      const a=2*Math.PI*i/n+angle;
      return [x+rx*ratio*Math.cos(a),y+level,z+rz*ratio*Math.sin(a)];
    });
    const bottom=ring(-h/2,1), upper=ring(h/2,top);
    faces.push([bottom,color],[upper,color]);
    for(let i=0;i<n;i++){
      const j=(i+1)%n;
      faces.push([[bottom[i],bottom[j],upper[j],upper[i]],color]);
    }
  }
  function box(x,y,z,w,h,d,color){prism(x,y,z,w/Math.SQRT2,d/Math.SQRT2,h,color,4,1,Math.PI/4);}
  function beam(a,b,width,color){
    const dx=b[0]-a[0], dz=b[2]-a[2], len=Math.hypot(dx,dz)||1;
    const offset=[-dz/len*width,0,dx/len*width];
    const shift=(p,n)=>p.map((v,i)=>v+offset[i]*n);
    faces.push([[shift(a,1),shift(b,1),shift(b,-1),shift(a,-1)],color]);
    faces.push([[a,b,[b[0],b[1]+width,b[2]],[a[0],a[1]+width,a[2]]],color]);
  }
  function panel(side,y,z=0){
    box(side*1.36,y,z,1.48,.06,.63,solar);
    for(let i=0;i<4;i++)box(side*(.84+.34*i),y+.041,z,.018,.012,.6,metal);
  }
  function legs(n,width=1.37){
    for(let i=0;i<n;i++){
      const a=2*Math.PI*i/n+Math.PI/4, x=Math.cos(a),z=Math.sin(a);
      beam([x*.54,-.05,z*.54],[x*width,-.78,z*width],.045,metal);
      beam([x*.40,-.42,z*.40],[x*width,-.78,z*width],.023,dark);
      prism(x*width,-.81,z*width,.17,.17,.06,metal);
    }
  }
  const dish=(x,y,z,r)=>{prism(x,y,z,r*.48,r*.48,.2,metal,14,2);prism(x,y+.14,z,.035,.035,.25,gold,6);};
  if(['ghost','nova','griffin','blueMoon','lander','surveyor','lm','return'].includes(type)){
    const tall=type==='nova'||type==='blueMoon';
    const wide=type==='griffin'||type==='blueMoon';
    if(type==='surveyor'){
      prism(0,-.42,0,.63,.63,.22,metal,3);
      prism(0,.05,0,.16,.16,.89,metal,4);
      legs(3);
      panel(1,.46);
    }else{
      prism(0,-.21,0,wide?.98:.78,wide?.98:.78,tall?1.02:.58,type==='nova'?white:gold,type==='lm'?8:6);
      if(type==='lm'||type==='return')prism(0,.28,0,.55,.5,.57,metal,8,.8);
      if(type==='ghost'||type==='lander')box(0,.18,-.33,.95,.48,.09,solar);
      if(type==='blueMoon')box(0,.27,0,1.35,.11,1.28,solar);
      legs(type==='nova'?6:4,wide?1.65:1.37);
    }
    dish(.19,tall?.5:.45,.15,.33);
  }else if(['rover','lunokhod'].includes(type)){
    if(type==='lunokhod')prism(0,0,0,.83,.62,.52,gold,12,.85);
    else box(0,0,0,1.43,.46,.84,gold);
    const count=type==='lunokhod'?4:3;
    for(const side of [-1,1])for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*.48;
      prism(x,-.29,side*.55,.21,.18,.32,dark,10);
      box(x,-.25,side*.4,.14,.10,.4,metal);
    }
    box(0,.38,0,1.38,.07,.72,solar);
    prism(-.26,.58,.14,.045,.045,.38,metal,5);
    box(-.26,.8,.14,.28,.16,.16,white);
  }else if(type==='orion'||type==='apollo'){
    prism(0,-.24,0,.52,.52,.89,metal,18);
    prism(0,.43,0,.56,.56,.49,white,18,.36);
    prism(0,-.79,0,.32,.32,.26,dark,12,.56);
    if(type==='orion'){
      panel(-1,-.27,.44);panel(1,-.27,.44);
      panel(-1,-.27,-.44);panel(1,-.27,-.44);
    }else dish(.74,-.47,.31,.23);
  }else{
    const small=type==='cubesat', ranger=type==='ranger';
    if(small)box(0,0,0,.58,.96,.57,gold);
    else prism(0,0,0,.60,.55,ranger?1.04:.73,type==='lro'?metal:gold,ranger?6:8,ranger?.65:1);
    if(type==='lro'){panel(1,.05);dish(-.68,.36,0,.44);}
    else {panel(-1,-.09);panel(1,-.09);dish(0,.51,0,small?.20:.37);}
    prism(0,.87,0,.022,.022,.35,metal,5);
  }
  return faces;
}
function drawModel(){
  modelContext.clearRect(0,0,modelCanvas.width,modelCanvas.height);
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const transform=([x,y,z])=>{
    const tx=x*cy+z*sy, tz=z*cy-x*sy;
    return [tx,y*cp-tz*sp,tz*cp+y*sp];
  };
  const depthSort=modelFaces.map(([face,color])=>{
    const vertices=face.map(transform);
    return {vertices,color,depth:vertices.reduce((z,p)=>z+p[2],0)/vertices.length};
  }).sort((a,b)=>a.depth-b.depth);
  for(const {vertices,color} of depthSort){
    const [a,b,c]=vertices;
    const u=b.map((v,i)=>v-a[i]),v=c.map((val,i)=>val-a[i]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const light=.68+.31*Math.abs((-.4*normal[0]+.54*normal[1]+.72*normal[2])/(Math.hypot(...normal)||1));
    modelContext.beginPath();
    for(const [x,y,z] of vertices){
      const scale=61*7/(7-z);
      modelContext.lineTo(220+x*scale,114-y*scale);
    }
    modelContext.closePath();
    modelContext.fillStyle=color;
    modelContext.fill();
    modelContext.fillStyle='rgba(4,13,29,'+(1-light)+')';
    modelContext.fill();
    modelContext.strokeStyle='#08121c';modelContext.lineWidth=.65;modelContext.stroke();
  }
}
function showSpacecraft(mission){
  const known=models.find(entry=>entry.pattern.test(mission.name));
  const type=known?.type??(/rover|hopper/i.test(mission.type)?'rover':/sample return/i.test(mission.type)?'return':/lander|crewed landing/i.test(mission.type)?'lander':'probe');
  const label=known?.name??('Representative '+(type==='return'?'sample-return craft':type==='probe'?'probe':type));
  modelFaces=createModel(type);
  modelCanvas.setAttribute('aria-label',mission.name+' spacecraft model. Drag or use arrow keys to rotate.');
  document.getElementById('model-caption').textContent=label+' · illustrative geometry';
  yaw=-.62;pitch=.28;drawModel();
}
function rotateModel(x,y){yaw+=x;pitch=Math.max(-1.2,Math.min(1.2,pitch+y));drawModel();}
dragView(modelCanvas,(x,y)=>rotateModel(x*.02,y*.02));
modelCanvas.onkeydown=e=>{
  const movement={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,.2],ArrowDown:[0,-.2]}[e.key];
  if(movement){e.preventDefault();rotateModel(...movement);}
};
document.getElementById('rotate-model').onclick=()=>rotateModel(Math.PI/4,0);
