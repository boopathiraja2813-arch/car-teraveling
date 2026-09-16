(()=>{
'use strict';
const $=id=>document.getElementById(id), API='/api';
const pages={driver:$('driverPage'),history:$('historyPage')};
let trip={active:false,waiting:false,from:'',to:'',rate:20,travelSeconds:0,waitingSeconds:0,distance:0,distanceMeters:0,lastLat:null,lastLon:null};
let timer=null,watchId=null,recognition=null;
let driverMap=null,driverMarker=null;
const pad=n=>String(Math.floor(n)).padStart(2,'0');
const fmt=s=>{s=Math.max(0,Math.floor(s));return `${pad(s/3600)}:${pad((s%3600)/60)}:${pad(s%60)}`};
const money=n=>`₹${Math.max(0,Math.round(n)).toLocaleString('en-IN')}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2600)}
async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};const r=await fetch(API+path,{...opts,headers});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.message||'Request failed');return d}
function showPage(n){Object.values(pages).forEach(p=>p.classList.add('hidden'));pages[n].classList.remove('hidden');scrollTo(0,0);if(n==='history')loadHistory()}
function updateUI(){
$('travelTime').textContent=fmt(trip.travelSeconds);$('waitingTime').textContent=fmt(trip.waitingSeconds);$('distanceValue').textContent=`${trip.distance} km`;$('rateInput').value=trip.rate;
$('startTripBtn').classList.toggle('hidden',trip.active);$('endTripBtn').disabled=!trip.active;$('waitingBtn').disabled=!trip.active;
$('waitingLabel').textContent=trip.waiting?'Resume Trip':'Start Waiting';$('waitingBtn').classList.toggle('is-waiting',trip.waiting);
}
function tick(){if(!trip.active)return;const now=Date.now();if(!tick.last)tick.last=now;const d=Math.min(2,Math.max(0,(now-tick.last)/1000));tick.last=now;if(trip.waiting)trip.waitingSeconds+=d;else trip.travelSeconds+=d;updateUI()}
function startClock(){clearInterval(timer);tick.last=Date.now();timer=setInterval(tick,1000)}
function stopGPS(){if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null}}
function startGPS(){stopGPS();if(!navigator.geolocation){toast('This device does not support GPS.');return}watchId=navigator.geolocation.watchPosition(sendLocation,()=>toast('GPS signal unavailable. Try again outdoors.'),{enableHighAccuracy:true,maximumAge:2000,timeout:10000})}
async function sendLocation(pos){if(!trip.active||trip.waiting)return;const c=pos.coords;if(c.accuracy>60)return;try{const d=await api('/trips/location',{method:'POST',body:JSON.stringify({lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,speed:c.speed,timestamp:pos.timestamp})});if(d.trip){Object.assign(trip,d.trip);updateUI();updateDriverMap(c.latitude,c.longitude)}}catch(e){if(!String(e.message).toLowerCase().includes('waiting'))toast(e.message)}}
async function restoreActive(){try{const d=await api('/trips/active');if(d.trip){Object.assign(trip,d.trip,{active:true});startClock();startGPS();updateUI();if(d.trip.lastLat)updateDriverMap(d.trip.lastLat,d.trip.lastLon)}}catch{}}
async function startTrip(){const from=$('fromInput').value.trim(),to=$('toInput').value.trim(),rate=Math.max(1,Number($('rateInput').value)||20);if(!from||!to)return toast('Please enter both From and To locations.');try{const d=await api('/trips/start',{method:'POST',body:JSON.stringify({from,to,rate})});Object.assign(trip,d.trip,{active:true});startClock();startGPS();updateUI();toast('Trip started. GPS tracking is active.')}catch(e){toast(e.message)}}
async function toggleWaiting(){if(!trip.active)return;const waiting=!trip.waiting;try{const d=await api('/trips/state',{method:'PATCH',body:JSON.stringify({waiting})});Object.assign(trip,d.trip);updateUI();toast(waiting?'Waiting started. Travel time and distance are paused.':'Trip resumed. GPS tracking continues.')}catch(e){toast(e.message)}}
async function endTrip(){if(!trip.active)return;const btn=$('endTripBtn');btn.disabled=true;try{const d=await api('/trips/end',{method:'POST',body:JSON.stringify({rate:Math.max(1,Number($('rateInput').value)||trip.rate)})});stopGPS();clearInterval(timer);trip={active:false};updateUI();openSummary(d.trip);$('fromInput').value='';$('toInput').value='';loadHistory().catch(()=>{})}catch(e){btn.disabled=false;toast(e.message)}}
let lastCompletedTrip=null;
function openSummary(r){lastCompletedTrip=r;$('summaryFrom').textContent=(r.route&&r.route.length)?r.route[0]:r.from;$('summaryTo').textContent=(r.route&&r.route.length)?r.route[r.route.length-1]:r.to;$('summaryTravel').textContent=fmt(r.travelSeconds);$('summaryDistance').textContent=`${r.distance} km`;$('summaryWaiting').textContent=fmt(r.waitingSeconds);$('summaryCost').textContent=money(r.calculatedCost??r.totalCost);$('summaryModal').classList.remove('hidden')}

function openMaps(){
 const from=$('fromInput').value.trim()||'Current location';
 const to=$('toInput').value.trim();
 if(!to)return toast('Enter a destination first.');
 window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`,'_blank');
}
async function locate(){
 if(!navigator.geolocation)return toast('GPS is not supported on this device.');
 try{
  const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
   enableHighAccuracy:true,timeout:20000,maximumAge:0
  }));
  const {latitude,longitude,accuracy}=p.coords;
  $('fromInput').value=`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  updateDriverMap(latitude,longitude);
  toast(`Current GPS location added${accuracy?` (±${Math.round(accuracy)}m)`:''}.`);
 }catch(e){
  $('fromInput').value='';
  toast('Location permission denied or GPS unavailable.');
 }
}
function voice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return toast('Voice input needs Chrome or Edge.');if(recognition){recognition.stop();return}recognition=new SR();recognition.lang='ta-IN';recognition.interimResults=true;recognition.continuous=false;$('micBtn').classList.add('recording');recognition.onresult=e=>$('toInput').value=Array.from(e.results).map(r=>r[0].transcript).join('');recognition.onerror=()=>toast('Voice input stopped.');recognition.onend=()=>{recognition=null;$('micBtn').classList.remove('recording')};recognition.start();toast('Speak destination in Tamil or English.')}
function initMap(){if(!window.google?.maps)return;const center={lat:11.0168,lng:76.9558};driverMap=new google.maps.Map($('driverMap'),{center,zoom:12,mapTypeId:'roadmap',streetViewControl:false,mapTypeControl:false,fullscreenControl:true})}
function updateDriverMap(lat,lng){if(!window.google?.maps)return;const p={lat:Number(lat),lng:Number(lng)};if(!driverMap)initMap();if(!driverMap)return;if(!driverMarker)driverMarker=new google.maps.Marker({map:driverMap,position:p,title:'Current location'});else driverMarker.setPosition(p);driverMap.setCenter(p);driverMap.setZoom(16)}

document.querySelectorAll('.nav-home').forEach(b=>b.onclick=()=>showPage('driver'));document.querySelectorAll('.nav-history').forEach(b=>b.onclick=()=>showPage('history'));$('startTripBtn').onclick=startTrip;$('waitingBtn').onclick=toggleWaiting;$('endTripBtn').onclick=endTrip;$('micBtn').onclick=voice;$('openMapsBtn').onclick=openMaps;$('searchDestinationBtn').onclick=()=>{const q=$('toInput').value.trim();if(q)window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,'_blank');else toast('Type a destination first.')};$('rateInput').oninput=e=>trip.rate=Math.max(1,Number(e.target.value)||1);$('rateUp').onclick=()=>{trip.rate++;updateUI()};$('rateDown').onclick=()=>{trip.rate=Math.max(1,trip.rate-1);updateUI()};$('historySearch').oninput=loadHistory;$('filterToggle').onclick=()=>$('filterChips').classList.toggle('hidden');document.querySelectorAll('.filter-chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter-chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadHistory()});$('historyList').onclick=e=>{const b=e.target.closest('[data-delete]');if(b)deleteTrip(b.dataset.delete)};$('closeSummary').onclick=closeSummary;$('summaryDone').onclick=closeSummary;$('summaryModal').querySelector('.modal-backdrop').onclick=closeSummary;$('rateEye').onclick=()=>{const i=$('rateInput'),show=i.type==='password';i.type=show?'text':'password';$('rateEye').textContent=show?'◉':'◌';$('rateEye').title=show?'Hide rate':'Show rate';$('rateEye').setAttribute('aria-label',show?'Hide rate':'Show rate')};
restoreActive();updateUI();
window.initDriveTrackMap=initMap;
})();

window.addEventListener('load',()=>{ setTimeout(locate,150); });
