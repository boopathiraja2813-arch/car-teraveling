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
const normalizeRate=(value,fallback=20)=>{const n=Number(value);if(Number.isFinite(n)&&n>0)return n;return Number.isFinite(fallback)&&fallback>0?fallback:20};
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
async function startTrip(){const from=$('fromInput').value.trim(),to=$('toInput').value.trim(),rate=normalizeRate($('rateInput').value,trip.rate||20);if(!from||!to)return toast('Please enter both From and To locations.');try{const d=await api('/trips/start',{method:'POST',body:JSON.stringify({from,to,rate})});Object.assign(trip,d.trip,{active:true});startClock();startGPS();updateUI();toast('Trip started. GPS tracking is active.')}catch(e){toast(e.message)}}
async function toggleWaiting(){if(!trip.active)return;const waiting=!trip.waiting;try{const d=await api('/trips/state',{method:'PATCH',body:JSON.stringify({waiting})});Object.assign(trip,d.trip);updateUI();toast(waiting?'Waiting started. Travel time and distance are paused.':'Trip resumed. GPS tracking continues.')}catch(e){toast(e.message)}}
async function endTrip(){if(!trip.active)return;const btn=$('endTripBtn');btn.disabled=true;try{const d=await api('/trips/preview',{method:'POST'});openSummary(d.trip)}catch(e){toast(e.message)}finally{btn.disabled=!trip.active}}
let lastCompletedTrip=null;
function openSummary(r){lastCompletedTrip=r;$('summaryFrom').textContent=r.from||r.originalFrom||r.route?.[0]||'—';$('summaryTo').textContent=r.to||r.originalTo||r.route?.[1]||'—';$('summaryReturn').textContent=r.returnTrip?'Yes':'No';$('summaryTravel').textContent=fmt(r.travelSeconds);$('summaryWaiting').textContent=fmt(r.waitingSeconds);$('summaryTravelCharge').textContent=money(r.travelCharge);$('summaryWaitingCharge').textContent=money(r.waitingCharge);$('summaryCost').textContent=money(r.totalCost??r.calculatedCost);$('returnTripBtn').disabled=Boolean(r.returnTrip);$('summaryModal').classList.remove('hidden')}
function closeSummary(){$('summaryModal').classList.add('hidden');lastCompletedTrip=null}
async function confirmEnd(){if(!trip.active)return;const btn=$('summaryDone');btn.disabled=true;try{await api('/trips/end',{method:'POST',body:JSON.stringify({rate:normalizeRate($('rateInput').value,trip.rate||20)})});stopGPS();clearInterval(timer);trip={active:false,waiting:false,rate:20};closeSummary();updateUI();$('fromInput').value='';$('toInput').value='';await loadHistory();toast('Trip completed and saved to history.')}catch(e){toast(e.message)}finally{btn.disabled=false}}
async function returnTrip(){if(!trip.active)return;if(trip.returnTrip)return toast('Return Trip already active.');const btn=$('returnTripBtn');btn.disabled=true;try{const d=await api('/trips/return',{method:'POST'});Object.assign(trip,d.trip,{active:true});closeSummary();updateUI();toast('Return Trip started. GPS tracking continues.')}catch(e){toast(e.message)}finally{btn.disabled=false}}

function buildMapsUrl(){
 const fromValue=$('fromInput').value.trim();
 const toValue=$('toInput').value.trim();
 const hasCoords=/^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(fromValue);
 const origin=hasCoords?fromValue:'';
 if(origin&&toValue){return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(toValue)}&travelmode=driving`}
 if(origin){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(origin)}`}
 if(toValue){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(toValue)}`}
 return 'https://www.google.com/maps';
}
function openMaps(){
 const url=buildMapsUrl();
 if(typeof window !== 'undefined'){const newWindow=window.open(url,'_blank','noopener,noreferrer');if(!newWindow){window.location.href=url}}
}
async function locate(){
 const btn=$('locateBtn');
 if(!navigator.geolocation)return toast('GPS is not supported on this device.');
 btn.disabled=true;btn.textContent='Getting current GPS location...';
 try{
  const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));
  const {latitude,longitude}=p.coords;
  $('fromInput').value=`${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  updateDriverMap(latitude,longitude);
  toast('Current GPS location added.');
 }catch(e){
  $('fromInput').value='';
  toast(e.code===1?'Location permission denied. Please allow location access and try again.':'Unable to get current location. Please try again.');
 }finally{
  btn.disabled=false;btn.textContent='Use Current Location';
 }
}
function voice(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){toast('Voice input is not supported in this browser. Please use Chrome or type the destination.');return;}
 if(recognition){recognition.stop();return;}
 const target=$('toInput');
 const languages=['ta-IN','en-IN'];
 let languageIndex=0;
 const instance=new SR();
 recognition=instance;
 const startListening=()=>{instance.lang=languages[languageIndex]||'en-IN';instance.interimResults=true;instance.continuous=false;instance.onstart=()=>{$('micBtn').classList.add('recording');toast('Listening for destination...');};instance.onresult=e=>{const transcript=Array.from(e.results).map(r=>r[0]?.transcript||'').join(' ').trim();if(transcript)target.value=transcript;};instance.onerror=e=>{const error=e.error||'unknown';if(error==='language-not-supported'&&languageIndex<languages.length-1){languageIndex+=1;try{instance.start();return;}catch{}}const messages={
  'not-allowed':'Microphone permission denied. Please allow microphone access and try again.',
  'service-not-allowed':'Microphone permission denied. Please allow microphone access and try again.',
  'no-speech':'No speech detected. Please try again.',
  'network':'Voice input network error. Please check your connection and try again.',
  'audio-capture':'Microphone is unavailable. Please check your device settings.',
  'unavailable':'Voice input is unavailable right now. Please type the destination.',
  'language-not-supported':'This browser does not support the selected language. Please try English or Tamil.'
};toast(messages[error]||'Voice input failed. Please try again.');};instance.onend=()=>{if(recognition===instance)recognition=null;$('micBtn').classList.remove('recording');};try{instance.start();}catch{toast('Voice input is already running.');recognition=null;$('micBtn').classList.remove('recording');}}
startListening();
}
function initMap(){if(!window.google?.maps)return;const center={lat:11.0168,lng:76.9558};driverMap=new google.maps.Map($('driverMap'),{center,zoom:12,mapTypeId:'roadmap',streetViewControl:false,mapTypeControl:false,fullscreenControl:true})}
function updateDriverMap(lat,lng){if(!window.google?.maps)return;const p={lat:Number(lat),lng:Number(lng)};if(!driverMap)initMap();if(!driverMap)return;if(!driverMarker)driverMarker=new google.maps.Marker({map:driverMap,position:p,title:'Current location'});else driverMarker.setPosition(p);driverMap.setCenter(p);driverMap.setZoom(16)}
async function loadHistory(){try{const filter=document.querySelector('.filter-chip.active')?.dataset.filter||'month',search=$('historySearch').value.trim(),d=await api(`/trips?filter=${encodeURIComponent(filter)}&search=${encodeURIComponent(search)}`),list=d.trips||[];$('historyCount').textContent=`${list.length} trip${list.length===1?'':'s'}`;$('historyList').innerHTML=list.map(t=>{const date=new Date(t.createdAt);return `<article class="trip-history-card"><div class="trip-date">${esc(date.toLocaleDateString())} ${esc(date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</div><div class="trip-locations"><div><span>From</span><strong>${esc(t.originalFrom||t.from)}</strong></div><div><span>To</span><strong>${esc(t.originalTo||t.to)}</strong></div></div><div class="trip-stats"><div>Total KM<strong>${t.distance??0}</strong></div><div>Rate<strong>${money(t.rate)}</strong></div><div>Cost<strong>${money(t.totalCost??t.calculatedCost)}</strong></div></div><button class="delete-trip" data-delete="${esc(t.id)}" type="button" title="Delete trip">×</button></article>`}).join('');$('emptyHistory').classList.toggle('hidden',list.length>0)}catch(e){toast(e.message)}}
async function deleteTrip(id){if(!confirm('Delete this trip?'))return;try{await api(`/trips/${encodeURIComponent(id)}`,{method:'DELETE'});loadHistory()}catch(e){toast(e.message)}}

document.querySelectorAll('.nav-home').forEach(b=>b.onclick=()=>showPage('driver'));document.querySelectorAll('.nav-history').forEach(b=>b.onclick=()=>showPage('history'));$('startTripBtn').onclick=startTrip;$('waitingBtn').onclick=toggleWaiting;$('endTripBtn').onclick=endTrip;$('locateBtn').onclick=locate;$('micBtn').onclick=voice;$('openMapsBtn').onclick=openMaps;$('returnTripBtn').onclick=returnTrip;$('summaryDone').onclick=confirmEnd;$('searchDestinationBtn').onclick=()=>{const q=$('toInput').value.trim();if(q)window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,'_blank','noopener,noreferrer');else toast('Type a destination first.')};$('rateInput').oninput=e=>{const value=Number(e.target.value);trip.rate=Number.isFinite(value)&&value>0?value:20;updateUI();};$('rateUp').onclick=()=>{trip.rate=normalizeRate(trip.rate+1,trip.rate||20);updateUI()};$('rateDown').onclick=()=>{trip.rate=Math.max(1,trip.rate-1);updateUI()};$('historySearch').oninput=loadHistory;$('filterToggle').onclick=()=>$('filterChips').classList.toggle('hidden');document.querySelectorAll('.filter-chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter-chip').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadHistory()});$('historyList').onclick=e=>{const b=e.target.closest('[data-delete]');if(b)deleteTrip(b.dataset.delete)};$('rateEye').onclick=()=>{const i=$('rateInput'),show=i.type==='password';i.type=show?'text':'password';$('rateEye').textContent=show?'◉':'◌';$('rateEye').title=show?'Hide rate':'Show rate';$('rateEye').setAttribute('aria-label',show?'Hide rate':'Show rate')};
restoreActive();updateUI();
window.initDriveTrackMap=initMap;
})();
