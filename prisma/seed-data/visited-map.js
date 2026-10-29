(() => {
  'use strict';
  // WGS84 reference positions; regional visits do not imply seeing the entire area.
  const COORDS={
    tokyo:[139.6917,35.6895],osaka:[135.5023,34.6937],fuji:[138.7274,35.3606],
    nanchang:[115.8582,28.6820],changsha:[112.9388,28.2282],
    chenzhou:[113.0149,25.7705],chengdu:[104.0668,30.5728],chongqing:[106.5516,29.5630],xuzhou:[117.2841,34.2058],
    sichuan:[100.3471,28.4421],dali:[100.2676,25.6065],
    lijiang:[100.2278,26.8721],hongkong:[114.1694,22.3193],
    macau:[113.5439,22.1987],zhuhai:[113.5767,22.2707],shanghai:[121.4737,31.2304],
    bozhou:[115.7786,33.8463],zhongshan:[113.3928,22.5176],guangzhou:[113.2644,23.1291],
    foshan:[113.1214,23.0215],dongguan:[113.7518,23.0207],xiamen:[118.0894,24.4798],
    phuket:[98.3923,7.8804],malaysia:[101.6869,3.1390],
    qiannan:[107.5220,26.2580],huizhou:[114.4168,23.1115],
    guilin:[110.2991,25.2742],liuzhou:[109.4281,24.3264],
    hangzhou:[120.1551,30.2741],kunming:[102.8329,24.8801],
    shangrila:[99.7060,27.8250]
  };

  // Match ECharts GeoJSON feature names. Countries -> provinces -> prefectures.
  // City shapes are administrative prefectures. For broad "川西" we approximate
  // with 甘孜州 and preserve the exact visited point at 稻城亚丁.
  const REGIONS={
    tokyo:['Japan',null,null],osaka:['Japan',null,null],fuji:['Japan',null,null],
    nanchang:['China','江西省','南昌市'],
    changsha:['China','湖南省','长沙市'],chenzhou:['China','湖南省','郴州市'],
    chengdu:['China','四川省','成都市'],chongqing:['China','重庆市','重庆市'],sichuan:['China','四川省','甘孜藏族自治州'],
    dali:['China','云南省','大理白族自治州'],lijiang:['China','云南省','丽江市'],
    hongkong:['China','香港特别行政区','香港特别行政区'],
    macau:['China','澳门特别行政区','澳门特别行政区'],
    zhuhai:['China','广东省','珠海市'],
    shanghai:['China','上海市','上海市'],
    bozhou:['China','安徽省','亳州市'],zhongshan:['China','广东省','中山市'],guangzhou:['China','广东省','广州市'],
    foshan:['China','广东省','佛山市'],dongguan:['China','广东省','东莞市'],xiamen:['China','福建省','厦门市'],
    phuket:['Thailand',null,null],malaysia:['Malaysia',null,null],
    qiannan:['China','贵州省','黔南布依族苗族自治州'],
    huizhou:['China','广东省','惠州市'],
    guilin:['China','广西壮族自治区','桂林市'],
    liuzhou:['China','广西壮族自治区','柳州市'],
    hangzhou:['China','浙江省','杭州市'],
    kunming:['China','云南省','昆明市'],
    shangrila:['China','云南省','迪庆藏族自治州'],xuzhou:['China','江苏省','徐州市']
  };
  const COLORS={both:'#f5c88e',her:'#c9b1fd',mine:'#75e1cf'};
  const AREA_COLORS={both:'#977b56',her:'#786598',mine:'#377d73'};
  const BORDER_COLORS={both:'#dfc092',her:'#c4acef',mine:'#77c8b6'};
  const LABELS={both:'我们都去过',her:'王颖单独去过',mine:'我单独去过'};
  const NOTES={
    sichuan:'川西为较大区域，城市范围图用甘孜州近似表示，并非整个甘孜州都走遍。',
    qiannan:'黔南为自治州，城市范围图会标亮黔南州边界，不代表每个县都去过。',
    fuji:'富士山是山体地标，日本使用国家范围高亮和富士山位置标记。',
    shangrila:'香格里拉市隶属迪庆州。当前城市层级只有迪庆州行政边界，因此以迪庆州作为近似范围，并不代表整个州都去过。',
    chongqing:'你和王颖分别于2025年11月、2023年3月独自到访重庆，并非共同出行。',
    zhuhai:'2020年7月你第一次独自游玩珠海；2022年2月与王颖一起游玩珠海长隆。',
    bozhou:'亳州是故乡，不按单独旅行日期放入时间轴。',
    zhongshan:'广东的家',
    guangzhou:'目前工作生活的城市',
    foshan:'你2017年9月到访，王颖2018年到访（月未详）；不代表两人同次出行。',
    dongguan:'2025年8月你和王颖一起去过。',
    dali:'王颖2024年8月已到访；你的2026年11月行程尚未发生。',
    lijiang:'王颖2024年8月已到访；你的2026年11月行程尚未发生。',
    default:'填色表示区域内存在足迹，并非整片区域已探索。'
  };
  // Expose map metadata for the one-time SQLite import script.
  window.TRAVEL_MAP_CONFIG = { coords: COORDS, regions: REGIONS, notes: NOTES };
  const $=id=>document.getElementById(id);
  const shell=$('visitedGeoMap');
  if(!shell)return;
  const geoData=window.TRAVEL_MAP_GEOMETRY;
  if(!window.echarts||!geoData?.china||!geoData?.world||!geoData?.city){
    shell.innerHTML='<p class="map-error">地图资源未能加载。请把 vendor 和 assets/maps 目录一起部署。</p>';
    return;
  }
  const places=(window.VISITED_JOURNAL?.places||[]).map(p=>({...p,coord:COORDS[p.id],regionNames:REGIONS[p.id]})).filter(p=>p.coord&&p.regionNames);
  const missing=(window.VISITED_JOURNAL?.places||[]).filter(p=>!COORDS[p.id]||!REGIONS[p.id]);
  if(missing.length)console.warn('Missing map mapping for',missing.map(x=>x.id));
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile=()=>matchMedia('(max-width:740px)').matches;
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MODES={
    world:{map:'travelWorld',idx:0,label:'个国家',initialZoom:2.35,center:[112,29]},
    china:{map:'travelChina',idx:1,label:'个省级地区',initialZoom:1.13,center:null},
    city:{map:'travelCity',idx:2,label:'个城市或自治州',initialZoom:1.22,center:null}
  };
  let mode='china',category='all',query='',activeId='chengdu';
  let zoom=MODES[mode].initialZoom,center=MODES[mode].center;
  const chart=window.echarts.init(shell,null,{renderer:'canvas'});
  window.echarts.registerMap('travelChina',geoData.china);
  window.echarts.registerMap('travelWorld',geoData.world);
  window.echarts.registerMap('travelCity',geoData.city);
  window.TRAVEL_ATLAS_MAP=chart;
  // Diagnostics for offline release checks.
  window.TRAVEL_ATLAS_REGIONS=REGIONS;

  function onThisMap(p){return mode==='world'||p.regionNames[1]!==null;}
  function filteredPlaces(){
    return places.filter(p=>onThisMap(p)
      &&(category==='all'||p.group===category)
      &&(!query||[p.name,p.region].some(x=>x.toLowerCase().includes(query))));
  }
  const scatterItem=p=>({name:p.name,id:p.id,group:p.group,value:p.coord,itemStyle:{color:COLORS[p.group]}});
  function regionEntries(list){
    const byRegion=new Map();
    const idx=MODES[mode].idx;
    for(const p of list){
      const region=p.regionNames[idx];
      if(!region)continue;
      if(!byRegion.has(region))byRegion.set(region,[]);
      byRegion.get(region).push(p);
    }
    return byRegion;
  }
  function dominantGroup(entries){
    // Filling a region shows that this category has *a* visit, not that it is entirely visited.
    if(entries.some(p=>p.group==='both'))return 'both';
    if(entries.some(p=>p.group==='her'))return 'her';
    return 'mine';
  }
  function fillOptions(byRegion){
    return [...byRegion.entries()].map(([name,members])=>{
      const group=dominantGroup(members);
      return {
        name,
        itemStyle:{
          areaColor:AREA_COLORS[group],
          borderColor:BORDER_COLORS[group],
          borderWidth:mode==='city'?.95:1.15,
          shadowBlur:mode==='world'?3:5,
          shadowColor:'rgba(239,195,150,.14)'
        },
        emphasis:{
          itemStyle:{areaColor:COLORS[group],borderColor:'#f9ead6',borderWidth:1.35},
          label:{show:false}
        }
      };
    });
  }
  function geoTooltip(params,byRegion){
    const ps=byRegion.get(params.name);
    if(!ps)return '';
    const items=ps.map(p=>safe(p.name)).join('、');
    return '<b>'+safe(params.name)+'</b><div style="font-size:11px;margin-top:4px">'+items+'</div><small style="color:#69867a">区域内有到访记录 · 未必全域游览</small>';
  }
  function chartOptions(list,byRegion){
    const active=list.find(p=>p.id===activeId);
    const small=mobile(),def=MODES[mode];
    return {
      backgroundColor:'transparent',animation:!reduceMotion,animationDuration:470,
      tooltip:{
        trigger:'item',confine:true,borderWidth:0,padding:[9,11],
        backgroundColor:'rgba(255,251,240,.98)',
        textStyle:{color:'#214b43',fontSize:12},
        extraCssText:'border-radius:8px;box-shadow:0 9px 32px rgba(0,0,0,.25)',
        formatter:params=>{
          if(params.data?.id){
            const p=list.find(p=>p.id===params.data.id);
            return p?'<b>'+safe(p.name)+'</b><div style="font-size:11px;opacity:.78">'+safe(LABELS[p.group])+(p.when?' · '+safe(p.when):'')+'</div>':'';
          }
          return geoTooltip(params,byRegion);
        }
      },
      geo:{
        id:'travelGeo',
        map:def.map,
        roam:true,selectedMode:false,
        scaleLimit:{min:.7,max:20},
        zoom,center:center?[...center]:undefined,
        layoutCenter:['50%','48%'],
        layoutSize:small?'96%':'94%',
        itemStyle:{
          areaColor:'#315550',
          borderColor:'#799d8e',
          borderWidth:mode==='city'?.65:.75
        },
        regions:fillOptions(byRegion),
        tooltip:{show:true,formatter:params=>geoTooltip(params,byRegion)},
        emphasis:{
          label:{show:false},
          itemStyle:{areaColor:'#456e64',borderColor:'#b0c9b5',borderWidth:1}
        },
        label:{show:false}
      },
      series:[
        {id:'markers',name:'已去过的地点',type:'scatter',coordinateSystem:'geo',data:list.map(scatterItem),
          symbol:'circle',symbolSize:small?9:11,z:5,
          itemStyle:{borderColor:'#fff6e6',borderWidth:1.2,shadowBlur:9,shadowColor:'rgba(0,0,0,.35)'},
          emphasis:{scale:1.7,label:{show:true,position:'top',formatter:'{b}',color:'#fff5e7',fontSize:12,fontWeight:'bold',distance:8,textShadowColor:'#0f3632',textShadowBlur:8}}
        },
        {id:'selected',name:'当前地点',type:reduceMotion?'scatter':'effectScatter',
          coordinateSystem:'geo',data:active?[scatterItem(active)]:[],symbol:'circle',
          symbolSize:small?15:18,z:6,
          itemStyle:{borderWidth:1.2,borderColor:'#fff9e9',shadowBlur:14,shadowColor:'rgba(250,232,209,.45)'},
          label:{show:true,position:'top',formatter:'{b}',color:'#fff7e8',fontWeight:'bold',fontSize:12,distance:11,textShadowColor:'#123632',textShadowBlur:8},
          ...(reduceMotion?{}:{showEffectOn:'render',rippleEffect:{scale:3.3,period:4,brushType:'stroke'}})
        }
      ]
    };
  }
  function details(list){
    const p=list.find(p=>p.id===activeId);
    $('mapSelectedPhoto').hidden=!p;
    if(!p){
      $('mapSelectedName').textContent='暂无匹配地点';
      $('mapSelectedGroup').textContent='筛选结果';
      $('mapSelectedRegion').textContent='';
      $('mapSelectedNote').textContent='可以切换层级、调整筛选条件。';
      return;
    }
    $('mapSelectedPhoto').src=p.image;
    $('mapSelectedPhoto').alt=p.name+'参考景观图片';
    $('mapSelectedName').textContent=p.name;
    $('mapSelectedGroup').textContent=LABELS[p.group];
    $('mapSelectedGroup').dataset.group=p.group;
    $('mapSelectedRegion').textContent=p.region+(p.when?' · '+p.when:'');
    $('mapSelectedNote').textContent=NOTES[p.id]||NOTES.default;
  }
  function render(){
    const list=filteredPlaces();
    if(!list.some(p=>p.id===activeId))activeId=list[0]?.id||null;
    const byRegion=regionEntries(list);
    $('mapVisibleCount').textContent=list.length;
    $('mapFilledCount').textContent=byRegion.size;
    $('mapFilledUnit').textContent=MODES[mode].label;
    $('mapModeNote').textContent=list.length
      ?(mode==='world'?'国家高亮 · 聚焦亚洲，可缩小看全球':mode==='china'?'省级高亮 · 点击区域查看足迹':'城市边界高亮 · 滚轮和按钮可放大')
      :'当前地图没有符合条件的足迹';
    chart.setOption(chartOptions(list,byRegion),true);
    details(list);
  }
  function setMode(next){
    if(!MODES[next]||next===mode)return;
    mode=next;
    zoom=MODES[mode].initialZoom;
    center=MODES[mode].center;
    document.querySelectorAll('[data-map-mode]').forEach(btn=>{
      const selected=btn.dataset.mapMode===mode;
      btn.classList.toggle('active',selected);
      btn.setAttribute('aria-pressed',String(selected));
    });
    $('mapSouthChina').hidden=mode==='world';
    render();
  }
  function zoomBy(factor){
    zoom=Math.max(.7,Math.min(20,zoom*factor));
    chart.setOption({geo:{zoom}},false);
  }
  function reset(){
    zoom=MODES[mode].initialZoom;
    center=MODES[mode].center;
    render();
  }
  function southChina(){
    if(mode==='world')return;
    zoom=6;center=[113.35,23.5];render();
  }
  document.querySelectorAll('[data-map-mode]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mapMode)));
  $('mapZoomIn').addEventListener('click',()=>zoomBy(1.55));
  $('mapZoomOut').addEventListener('click',()=>zoomBy(1/1.55));
  $('mapResetView').addEventListener('click',reset);
  $('mapSouthChina').addEventListener('click',southChina);
  chart.on('click',params=>{
    const list=filteredPlaces();
    if(params.data?.id&&list.some(p=>p.id===params.data.id)){
      activeId=params.data.id;render();return;
    }
    if(params.name){
      const targets=regionEntries(list).get(params.name);
      if(targets?.length){
        const i=targets.findIndex(p=>p.id===activeId);
        activeId=targets[(i+1)%targets.length].id;
        render();
      }
    }
  });
  chart.on('georoam',()=>{
    const geo=chart.getOption().geo?.[0];
    if(geo){
      if(Number.isFinite(geo.zoom))zoom=geo.zoom;
      center=geo.center||null;
    }
  });
  window.addEventListener('travel-atlas-filter',event=>{
    category=event.detail?.category||'all';
    query=event.detail?.query||'';
    render();
  });
  const observer=('ResizeObserver' in window)?new ResizeObserver(()=>chart.resize()):null;
  observer?.observe(shell);
  window.addEventListener('resize',()=>chart.resize(),{passive:true});
  render();
})();