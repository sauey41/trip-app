const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s·・,，.。/／()（）\-_]+/g,'');

function placeKey(location){
 const value=compact(location);
 if(!value)return '';
 if(/浦东(?:国际)?机场/.test(value))return 'airport:pudong';
 if(/(?:关西|関西)(?:国际|国際)?机场/.test(value))return 'airport:kansai';
 if(value.includes('机场'))return `airport:${value.split('机场')[0].replace(/国际|国際/g,'')}`;
 return value.replace(/(?:t\d+)?(?:航站楼|候机楼|登机口|到达层|出发层|站)$/g,'');
}

export function shouldShowStopMap(stops,index){
 const stop=stops[index],location=compact(stop?.location);
 if(!location)return false;
 const title=compact(stop.title),current=placeKey(stop.location);
 // A departure address and a generic hotel label are not useful destinations.
 if(/^(?:酒店|hotel|住宿|住处)$/.test(location))return false;
 if(index===0&&/(?:住宅|住处|家中|起床|出发地)/.test(title+location))return false;
 // A "hotel vicinity" entry often stores the hotel itself as its map location.
 if(/(?:酒店|hotel).{0,4}(?:周边|附近)/.test(title)&&/(?:酒店|hotel)/.test(location))return false;
 if(/(?:酒店|hotel)/.test(title+location)&&/(?:退房|取行李|整理)/.test(title))return false;
 const previous=stops[index-1];
 if(previous?.location&&placeKey(previous.location)===current)return false;
 return true;
}
