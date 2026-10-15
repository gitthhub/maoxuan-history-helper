(function(root){
'use strict';
function resolveSelection(articles,events,type,id,volume){
 const item=(type==='article'?articles:type==='event'?events:[]).find(x=>x.id===id);
 return item?{type,id,era:item.eraId,volume:type==='article'&&volume!=='all'?item.vol:volume}:null;
}
function clusterPoints(items,project,radius=34){
 const points=items.map(item=>({item,point:project(item.coords)})),groups=[],visited=new Set();
 for(let i=0;i<points.length;i++){
  if(visited.has(i))continue;
  const indices=[i];visited.add(i);
  for(let k=0;k<indices.length;k++){
   const p=points[indices[k]].point;
   for(let j=0;j<points.length;j++){
    const q=points[j].point;
    if(!visited.has(j)&&Math.hypot(p.x-q.x,p.y-q.y)<radius){visited.add(j);indices.push(j);}
   }
  }
  const entries=indices.map(j=>points[j].item);
  groups.push({items:entries,coords:[0,1].map(axis=>entries.reduce((sum,x)=>sum+x.coords[axis],0)/entries.length)});
 }
 return groups;
}
// WGS84 -> GCJ-02 for AMap. Input locations are approximate reference points.
function toAmap(coords){
 const [lat,lng]=coords;
 if(lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271)return [...coords];
 const pi=Math.PI,x=lng-105,y=lat-35;
 let dLat=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
 let dLng=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
 const wave=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
 dLat+=wave+(20*Math.sin(y*pi)+40*Math.sin(y*pi/3))*2/3+(160*Math.sin(y*pi/12)+320*Math.sin(y*pi/30))*2/3;
 dLng+=wave+(20*Math.sin(x*pi)+40*Math.sin(x*pi/3))*2/3+(150*Math.sin(x*pi/12)+300*Math.sin(x*pi/30))*2/3;
 const rad=lat/180*pi,sin=Math.sin(rad),magic=1-0.00669342162296594323*sin*sin;
 dLat=dLat*180/((6378245*(1-0.00669342162296594323))/(magic*Math.sqrt(magic))*pi);
 dLng=dLng*180/(6378245/Math.sqrt(magic)*Math.cos(rad)*pi);
 return [lat+dLat,lng+dLng];
}
const api={resolveSelection,clusterPoints,toAmap};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(globalThis);
