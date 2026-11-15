const coordinateArchive = 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html';
const surfaceSites = {
  'Luna 2':[30,0,'Estimated impact'],'Ranger 4':[-15.5,-130.7,'Estimated impact'],
  'Ranger 6':[9.3864,21.4806,'Impact'],'Ranger 7':[-10.634,-20.677,'Impact'],'Ranger 8':[2.6376,24.7881,'Impact'],'Ranger 9':[-12.8281,-2.3884,'Impact'],
  'Luna 7':[9,-49,'Estimated impact'],'Luna 8':[9.1,-63.3,'Estimated impact'],'Luna 9':[7.13,-64.37,'Reported landing area'],
  'Surveyor 1':[-2.4745,-43.3398],'Surveyor 2':[5.5,-12,'Estimated impact'],'Surveyor 3':[-3.0162,-23.418],
  'Surveyor 5':[1.4551,23.1943],'Surveyor 6':[0.4742,-1.4275],'Surveyor 7':[-40.9812,-11.5127],
  'Luna 13':[18.87,-62.05,'Reported landing area'],'Luna 16':[-0.5137,56.3638],'Luna 17':[38.23764,-35.00163],
  'Luna 20':[3.7863,56.6242],'Luna 21':[25.9994,30.4076],'Luna 23':[12.6667,62.1511],'Luna 24':[12.7142,62.2129],
  'Lunokhod 1':[38.315,-35.0081,'Rover position'],'Lunokhod 2':[25.8323,30.9222,'Rover position'],
  'Apollo 11':[0.67416,23.47314],'Apollo 12':[-3.0128,-23.4219],'Apollo 14':[-3.64589,-17.47194],
  'Apollo 15':[26.13239,3.63330],'Apollo 16':[-8.9734,15.5011],'Apollo 17':[20.1911,30.7723],
  'LCROSS':[-84.6796,-48.7093,'Centaur impact'],'SMART-1':[-34.4,-46.2,'Reported impact'],
  'Lunar Prospector':[-87.7,42,'Estimated impact'],
  'Gravity Recovery and Interior Laboratory (GRAIL)':[75.6088,-26.594,'GRAIL A impact'],
  'Lunar Atmosphere and Dust Environment Explorer (LADEE)':[11.8494,-93.2494,'Impact'],
  'Beresheet':[32.5956,19.3496,'Impact'],'Chandrayaan-2':[-70.881,22.784,'Vikram impact'],
  "Chang'e 3":[44.1214,-19.5117],'Yutu':[44.1208,-19.5122,'Rover position'],
  "Chang'e 4 and Yutu 2":[-45.4561,177.5885],"Chang'e 5":[43.0576,-51.9161],"Chang'e 6":[-41.6385,-153.9852],
  'Hakuto-R Mission 1':[47.581,44.094,'Impact'],'Emirates Lunar Mission':[47.581,44.094,'Carrier impact'],
  'Luna 25':[-57.865,61.360,'Impact'],'Chandrayaan-3':[-69.3741,32.32],'SLIM':[-13.316,25.251],
  'IM-1':[-80.13,1.44],'Blue Ghost 1':[18.562,61.810],'IM-2':[-84.7906,29.1957],
  'HAKUTO-R Mission 2':[60.4445,-4.588,'Impact']
};
const globe = document.getElementById('globe');
const globeContext = globe.getContext('2d');
const globePixels = globeContext.createImageData(globe.width,globe.height);
const origin = globe.width / 2;
const rad = Math.PI / 180;
let texture, globeSite, globeFrame;
let longitude = 0, latitude = 12, zoom = 1;
const textureImage = new Image();
textureImage.onload = () => {
  const sampler = document.createElement('canvas');
  sampler.width=textureImage.width;
  sampler.height=textureImage.height;
  const context=sampler.getContext('2d');
  context.drawImage(textureImage,0,0);
  texture=context.getImageData(0,0,sampler.width,sampler.height);
  drawGlobe();
};
textureImage.onerror=()=>{document.getElementById('globe-center').textContent='Texture unavailable';};
textureImage.src=lunarTexture;

function coordinateLabel(value, positive, negative, precision=2){
  return Math.abs(value).toFixed(precision)+'°'+(value<0?negative:positive);
}
function drawGlobe(){
  if(!texture)return;
  const radius=origin*.81*zoom;
  const sinLat=Math.sin(latitude*rad), cosLat=Math.cos(latitude*rad);
  const {data,width,height}=texture;
  const dest=globePixels.data;
  dest.fill(0);
  for(let j=0;j<globe.height;j++){
    const y=(origin-j)/radius;
    for(let i=0;i<globe.width;i++){
      const x=(i-origin)/radius;
      const square=1-x*x-y*y;
      if(square<0)continue;
      const z=Math.sqrt(square);
      const lat=Math.asin(Math.max(-1,Math.min(1,y*cosLat+z*sinLat)));
      const lon=Math.atan2(x,z*cosLat-y*sinLat)+longitude*rad;
      const u=Math.floor(((lon/(2*Math.PI)+1.5)%1)*width);
      const v=Math.min(height-1,Math.floor((.5-lat/Math.PI)*height));
      const input=4*(v*width+u), output=4*(j*globe.width+i);
      const light=.42+.78*Math.max(0,-.46*x+.40*y+.79*z);
      dest[output]=data[input]*light;
      dest[output+1]=data[input+1]*light;
      dest[output+2]=data[input+2]*light+5;
      dest[output+3]=Math.min(255,Math.sqrt(square)*radius*22);
    }
  }
  globeContext.putImageData(globePixels,0,0);
  if(globeSite){
    const lat=globeSite[0]*rad, lon=(globeSite[1]-longitude)*rad;
    const depth=Math.sin(lat)*sinLat+Math.cos(lat)*Math.cos(lon)*cosLat;
    if(depth>0){
      const x=origin+radius*Math.cos(lat)*Math.sin(lon);
      const y=origin-radius*(Math.sin(lat)*cosLat-Math.cos(lat)*Math.cos(lon)*sinLat);
      globeContext.beginPath();globeContext.arc(x,y,11,0,2*Math.PI);
      globeContext.lineWidth=2;globeContext.strokeStyle='#79c8ff';globeContext.stroke();
      globeContext.beginPath();globeContext.arc(x,y,4,0,2*Math.PI);
      globeContext.fillStyle='#e4f5ff';globeContext.fill();
    }
  }
  document.getElementById('globe-center').textContent=coordinateLabel(latitude,'N','S',0)+' / '+coordinateLabel(longitude,'E','W',0);
}
function queueGlobe(){
  if(globeFrame)return;
  globeFrame=requestAnimationFrame(()=>{globeFrame=null;drawGlobe();});
}
function centerGlobe(){
  latitude=globeSite?.[0]??12;
  longitude=globeSite?.[1]??0;
  zoom=1;
  queueGlobe();
}
function showGlobeMission(mission){
  globeSite=surfaceSites[mission.name];
  document.getElementById('coordinates').textContent=globeSite
    ? (globeSite[2]??'Landing site')+' · '+coordinateLabel(globeSite[0],'N','S')+' '+coordinateLabel(globeSite[1],'E','W')
    : 'No surface coordinate cataloged';
  centerGlobe();
}
function rotateGlobe(dx,dy){
  longitude=((longitude+dx+540)%360)-180;
  latitude=Math.max(-89.9,Math.min(89.9,latitude+dy));
  queueGlobe();
}
function zoomGlobe(amount){zoom=Math.max(1,Math.min(2.3,zoom+amount));queueGlobe();}
function dragView(canvas,move){
  let pointer;
  canvas.onpointerdown=e=>{
    if(pointer)return;
    pointer=[e.pointerId,e.clientX,e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(pointer?.[0]!==e.pointerId)return;
    move(e.clientX-pointer[1],e.clientY-pointer[2]);
    pointer=[e.pointerId,e.clientX,e.clientY];
  };
  canvas.onlostpointercapture=()=>{pointer=null;};
}
dragView(globe,(x,y)=>rotateGlobe(-x*.42,y*.42));
globe.onkeydown=e=>{
  const movement={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,10],ArrowDown:[0,-10]}[e.key];
  if(movement){e.preventDefault();rotateGlobe(...movement);}
  if(e.key==='+'||e.key==='-'){e.preventDefault();zoomGlobe(e.key==='+'?.2:-.2);}
};
document.getElementById('reset-globe').onclick=centerGlobe;
document.getElementById('zoom-in').onclick=()=>zoomGlobe(.22);
document.getElementById('zoom-out').onclick=()=>zoomGlobe(-.22);
