export const DEMO_DAY_ID='demo-hokkaido-branches';
export function createBranchDemoDay(){
 const stop=(id,time,endTime,title,kind,description,transport='',tips='',location='',preparations=[])=>({id,time,endTime,title,kind,status:'planned',description,transport,tips,location,preparations});
 return {id:DEMO_DAY_ID,demo:true,date:'',city:'札幌 / 小樽',theme:'交互演示 · 非正式安排',intro:'先在上午选择 Plan A / B，再试试独立的咖啡加站。不同方案都会回到共同主线。',stops:[
  stop('demo-hokkaido-start','09:00','09:30','四人在札幌集合（共同主线）','walk','演示：酒店大堂集合，确认大家是否准备好出发。','','共同主线：无论采用哪条路线，这一站都保留。','',[{id:'demo-prep-phone',title:'出门带好手机',done:false}]),
  stop('demo-otaru-canal','10:00','11:30','小樽运河散步（Plan A）','walk','演示：天气合适时，把上午留给户外散步与合照。','自驾路线演示；实际路况、道路安全和所需时间需另行确认。','这是方案示例，不代表已核实的冬季自驾建议。','小樽运河',[{id:'demo-prep-weather',title:'确认当天路况与天气',done:false}]),
  stop('demo-otaru-lunch','11:30','13:00','小樽午餐与返程准备（Plan A）','food','演示：在附近简单用餐，随后返回札幌与下午主线衔接。','从上一站按现场情况移动。','未指定餐厅，未产生预订。'),
  stop('demo-sapporo-indoor','10:00','11:30','札幌室内逛店（Plan B）','shopping','演示：晚出发或不想安排户外活动时，留在札幌自由逛店。','从集合地点前往市内，具体路线待定。','与 Plan A 互斥，选择后只展示这条路线。','札幌',[{id:'demo-prep-power',title:'带上充电宝',done:false}]),
  stop('demo-sapporo-lunch','11:30','13:00','札幌午餐与休息（Plan B）','food','演示：自由用餐，不安排跨城市移动，为下午留出余量。','','未指定餐厅，未产生预订。'),
  stop('demo-hokkaido-rejoin','14:30','15:30','札幌市区汇合（共同主线）','walk','无论上午选择小樽、札幌，还是跳过上午安排，都在这里继续共同活动。','演示汇合点；真实时间与地点之后再确定。','共同节点只出现一次，不需要在 Plan A、Plan B 中分别复制。'),
  stop('demo-coffee-stop','16:00','16:45','顺路咖啡与合照（可选加站）','food','演示：有时间就一起坐坐，想休息也可以直接跳过。','','这是可选项目，不加入时不计入执行进度。','',[{id:'demo-prep-camera',title:'想拍照的话带上相机',done:false}]),
  stop('demo-hokkaido-dinner','17:30','19:00','四人一起晚餐（共同主线）','food','演示：晚上重新集合吃饭，聊聊今天的体验。','','主线晚餐保持不变；没有创建真实餐厅预约。')
 ],routeGroups:[
  {id:'demo-morning-choice',title:'上午怎么走？',time:'10:00',kind:'choice',selectedOptionId:'',mergeNote:'三种选择都接回下方 14:30 的札幌共同汇合点。',options:[
   {id:'demo-plan-a',title:'Plan A · 小樽户外路线',condition:'适合较早出发、天气和路况合适，且大家想进行户外活动时。',stopIds:['demo-otaru-canal','demo-otaru-lunch']},
   {id:'demo-plan-b',title:'Plan B · 札幌轻松路线',condition:'适合晚出发、不想跨城市移动，或临时偏好室内活动时。',stopIds:['demo-sapporo-indoor','demo-sapporo-lunch']},
   {id:'demo-plan-skip',title:'跳过上午路线，直接接下午主线',condition:'上午自由休息；不把未采用的 Plan A / B 记作未完成。',stopIds:[]}
  ]},
  {id:'demo-coffee-choice',title:'要不要顺路喝杯咖啡？',time:'16:00',kind:'optional',selectedOptionId:'',mergeNote:'这次加站独立于上午路线，后面仍是 17:30 共同晚餐。',options:[
   {id:'demo-coffee-yes',title:'加入咖啡与合照',condition:'大家都有余力、时间允许时再加入。',stopIds:['demo-coffee-stop']},
   {id:'demo-coffee-no',title:'不加站，留出休息时间',condition:'隐藏咖啡节点，直接查看晚餐安排。',stopIds:[]}
  ]}
 ]};
}
