const API=(window.APP_CONFIG?.API_BASE_URL||'').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const money=x=>Number.isFinite(Number(x))?`${Number(x)>0?'+':''}$${Number(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';
const num=(x,d=2)=>Number.isFinite(Number(x))?Number(x).toFixed(d):'—';
const pct=x=>Number.isFinite(Number(x))?`${Number(x)*100>=0?'+':''}${(Number(x)*100).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={config:null,analysis:null,risk:null,gate:null,dynamic:null,repair:null,monitorTimer:null,lastBracketId:null};

async function api(path,opts={}){
 const r=await fetch(API+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
 const body=await r.text();
 let data;
 try{data=body?JSON.parse(body):{}}catch{data={detail:body.slice(0,300)}}
 if(!r.ok){
  const detail=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail||'');
  throw new Error(detail||`HTTP ${r.status}`);
 }
 return data;
}
function setPnl(el,v){el.textContent=money(v);el.classList.remove('profit','loss');if(Number(v)>0.005)el.classList.add('profit');if(Number(v)<-0.005)el.classList.add('loss')}
function json(x){return JSON.stringify(x,null,2)}
function kv(el,obj){el.innerHTML=Object.entries(obj||{}).map(([k,v])=>`<div class="kv"><b>${esc(k)}</b>${esc(typeof v==='object'?JSON.stringify(v):v)}</div>`).join('')||'<div class="kv">No data</div>'}
function optionize(select,items){const old=select.value;select.innerHTML=items.map(x=>`<option>${esc(x)}</option>`).join('');if(items.includes(old))select.value=old}

for(const b of document.querySelectorAll('.tab')) b.onclick=()=>{document.querySelectorAll('.tab,.tabpane').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active');if(b.dataset.tab==='dashboard')dashboardActivate();if(b.dataset.tab==='forecast')forecastActivate()};

async function loadConfig(){const c=await api('/api/config');state.config=c;const list=[...new Set([...(c.watchlist||[]),...SWING_SYMBOLS])];['researchSymbol','sentimentSymbol','tradeSymbol','riskSymbol'].forEach(id=>optionize($(id),list));$('systemLog').textContent=json(c);return c}
async function health(){try{const h=await api('/api/health');$('systemStatus').textContent=h.ok?'System: PASS':'System: CHECK';$('systemStatus').className='pill '+(h.ok?'ok':'warn');const {internal_log,...safeHealth}=h;$('systemLog').textContent=json(safeHealth);$('paperStatus').textContent=h.checks?.paper_account?'Alpaca: PAPER':'Alpaca: CHECK';$('paperStatus').className='pill '+(h.checks?.paper_account?'ok':'bad')}catch(e){$('systemStatus').textContent='System: ERROR';$('systemStatus').className='pill bad';$('systemLog').textContent=e.message}}
async function overview(){const [a,p,ps]=await Promise.all([api('/api/account'),api('/api/positions'),api('/api/pnl')]);const ac=a.account||{};$('portfolioValue').textContent=money(ac.portfolio_value).replace(/^\+/,'');$('cashValue').textContent=money(ac.cash).replace(/^\+/,'');$('buyingPower').textContent=money(ac.buying_power).replace(/^\+/,'');const pn=ps.pnl||{};setPnl($('realizedPnl'),pn.realized_pl);setPnl($('unrealizedPnl'),pn.unrealized_pl);setPnl($('totalPnl'),pn.total_pl);$('pnlStatus').textContent=pn.status||'—';$('pnlStatus').className='metric '+(pn.status==='PROFIT'?'profit':pn.status==='LOSS'?'loss':'');const rows=p.positions||[];$('positionsBody').innerHTML=rows.map(x=>`<tr><td><b>${esc(x.symbol)}</b></td><td>${esc(x.qty)}</td><td>${money(x.entry_price)}</td><td>${money(x.current_price)}</td><td>${money(x.market_value)}</td><td class="${Number(x.unrealized_pl)>=0?'profit':'loss'}">${money(x.unrealized_pl)}</td><td class="${Number(x.unrealized_pl_pct)>=0?'profit':'loss'}">${pct(x.unrealized_pl_pct)}</td></tr>`).join('')||'<tr><td colspan="7">No open positions.</td></tr>';optionize($('positionSymbol'),rows.map(x=>x.symbol));
const hasPositions = rows.length > 0;
$('positionSymbol').disabled = !hasPositions;
for(const id of ['positionRefreshBtn','reconcileBtn','repairPreviewBtn']){
 const button = document.getElementById(id);
 if(button) button.disabled = !hasPositions;
}
if(!hasPositions){
 state.dynamic = null;
 state.repair = null;
 $('positionLog').textContent =
  'No open PAPER positions \u2014 position management is unavailable.';
 $('exitPhase').textContent = '\u2014';
 $('rMultiple').textContent = '\u2014';
 $('currentStop').textContent = '\u2014';
 $('proposedStop').textContent = '\u2014';
 for(const id of ['applyStopBtn','repairBtn','closeBtn']){
  const button = document.getElementById(id);
  if(button) button.disabled = true;
 }
}}
async function analyze(){const s=$('researchSymbol').value,d=$('researchDays').value;$('researchReason').textContent='Analyzing…';try{const r=await api(`/api/research/${encodeURIComponent(s)}?days=${d}`);state.analysis=r.analysis;state.analysisSymbol=s;state.gate=null;state.gateContext=null;$('bracketBtn').disabled=true;const a=r.analysis||{};$('signalValue').textContent=a.signal||'—';$('signalValue').className='metric '+(a.signal==='BUY'?'profit':a.signal==='SELL'?'loss':'');$('signalStrength').textContent=num(a.strength,2);$('signalQuality').textContent=num(a.quality,2);$('signalPrice').textContent=money(a.indicators?.close);$('researchReason').textContent=a.reasoning||'—';kv($('indicatorGrid'),a.indicators||{});kv($('researchDiagnostics'),{...(r.diagnostics||{}),buy_score:a.buy_score,sell_score:a.sell_score,macro_score:a.macro_score,sentiment_raw:a.sentiment_score,sentiment_adjustment:a.sentiment_adjustment})}catch(e){$('researchReason').textContent=e.message}}
async function macro(){try{const r=await api('/api/macro');kv($('macroGrid'),r.macro||{})}catch(e){$('macroGrid').textContent=e.message}}
async function sentiment(){try{const r=await api(`/api/sentiment/${$('sentimentSymbol').value}`);kv($('sentimentGrid'),r.sentiment||{})}catch(e){$('sentimentGrid').textContent=e.message}}
async function quote(symbol,targets){const r=await api(`/api/quote/${symbol}`);const q=r.quote||{};targets(q);return q}
async function paperQuote(){try{await quote($('tradeSymbol').value,q=>{$('quoteValue').textContent=money(q.reference_price).replace(/^\+/,'');$('quoteDetail').textContent=`Bid ${(Number(q.bid)>0?money(q.bid).replace(/^\+/,''):'?')} · Ask ${(Number(q.ask)>0?money(q.ask).replace(/^\+/,''):'?')}`})}catch(e){$('paperLog').textContent=e.message}}
async function submitOrder(){if(!confirm('Submit this PAPER order?'))return;try{const body={symbol:$('tradeSymbol').value,qty:Number($('tradeQty').value),side:$('tradeSide').value,order_type:$('tradeType').value,limit_price:Number($('tradeLimit').value||0)};const r=await api('/api/orders',{method:'POST',body:JSON.stringify(body)});$('paperLog').textContent=json(r);await refreshAll()}catch(e){$('paperLog').textContent=e.message}}
async function history(){try{const r=await api('/api/orders/history?limit=200');$('historyBody').innerHTML=(r.orders||[]).map(o=>`<tr><td>${esc(o.filled_at||o.created_at||'')}</td><td>${esc(o.symbol)}</td><td>${esc(o.side)}</td><td>${esc(o.type)}</td><td>${esc(o.qty)}</td><td>${esc(o.filled_qty)}</td><td>${money(o.filled_avg_price)}</td><td>${esc(o.status)}</td><td>${esc(o.order_id)}</td></tr>`).join('')||'<tr><td colspan="9">No orders.</td></tr>'}catch(e){alert(e.message)}}
async function riskQuote(){try{await quote($('riskSymbol').value,q=>{$('riskEntry').value=Number(q.reference_price||0).toFixed(2);$('riskLog').textContent=`IEX reference: ${money(q.reference_price)}`})}catch(e){$('riskLog').textContent=e.message}}

function riskSignal(symbol){
 return state.analysisSymbol===symbol && state.analysis
  ? state.analysis : {};
}
function riskFingerprint(){
 return JSON.stringify({
  symbol:$('riskSymbol').value,
  entry:Number($('riskEntry').value),
  qty:Number($('riskQty').value),
  type:$('riskEntryType').value,
  analysisSymbol:state.analysisSymbol,
  strength:Number(riskSignal($('riskSymbol').value).strength||0),
  quality:Number(riskSignal($('riskSymbol').value).quality||0)
 });
}
function invalidateRisk(){
 state.risk=null;
 state.gate=null;
 state.riskContext=null;
 state.gateContext=null;
 $('bracketBtn').disabled=true;
 $('gateStatus').textContent='Gate: NOT RUN';
 $('gateStatus').className='pill neutral';
}

async function calcRisk(){try{const context=riskFingerprint();const a=riskSignal($('riskSymbol').value);const body={symbol:$('riskSymbol').value,entry_price:Number($('riskEntry').value),signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const r=await api('/api/risk/preview',{method:'POST',body:JSON.stringify(body)});if(context!==riskFingerprint())return;state.risk=r.risk;state.riskContext=context;state.gate=null;state.gateContext=null;$('riskAtr').textContent=num(r.risk.atr,2);$('riskStop').textContent=money(r.risk.stop_price).replace(/^\+/,'');$('riskTake').textContent=money(r.risk.take_profit_price).replace(/^\+/,'');$('riskRecommended').textContent=r.risk.recommended_qty;$('gateStatus').textContent='Gate: NOT RUN';$('gateStatus').className='pill neutral';$('bracketBtn').disabled=true;$('riskLog').textContent=json(r.risk)}catch(e){$('riskLog').textContent=e.message}}
function useQty(){if(state.risk)$('riskQty').value=state.risk.recommended_qty||1}
async function gate(){if(state.riskContext!==riskFingerprint()){invalidateRisk();}if(!state.risk){alert('Calculate Adaptive Risk first.');return}try{const context=riskFingerprint();const a=riskSignal($('riskSymbol').value);const body={symbol:$('riskSymbol').value,qty:Number($('riskQty').value),entry_price:Number($('riskEntry').value),signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const r=await api('/api/risk/gate',{method:'POST',body:JSON.stringify(body)});if(context!==riskFingerprint())return;state.gate=r.gate;state.gateContext=context;const pass=!!r.gate.passed;$('gateStatus').textContent='Gate: '+(pass?'PASS':(r.gate.failures||[]).includes('signal_quality_ok')?'FAIL (Quality)':'FAIL');$('gateStatus').className='pill '+(pass?'ok':'bad');$('bracketBtn').disabled=!pass;$('riskLog').textContent=json((({internal_log,...safe})=>safe)(r))}catch(e){$('gateStatus').textContent='Gate: ERROR';$('gateStatus').className='pill bad';$('riskLog').textContent=e.message}}
async function bracket(){if(!state.gate?.passed || state.gateContext!==riskFingerprint() || state.riskContext===null)return;if(!confirm('Submit BUY BRACKET to ALPACA PAPER?'))return;try{const a=riskSignal($('riskSymbol').value),r=state.risk;const body={symbol:$('riskSymbol').value,qty:Number($('riskQty').value),entry_price:Number($('riskEntry').value),entry_type:$('riskEntryType').value,take_profit_price:r.take_profit_price,stop_loss_price:r.stop_price,signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const x=await api('/api/orders/bracket',{method:'POST',body:JSON.stringify(body)});state.lastBracketId=x.order?.order_id||x.order?.id||null;$('riskLog').textContent=json(x);await refreshAll()}catch(e){$('riskLog').textContent=e.message}}
async function dynamicExit(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/position/dynamic-exit/${s}`);state.dynamic=r.exit;const x=r.exit;$('exitPhase').textContent=x.dynamic_exit_phase||'—';$('rMultiple').textContent=num(x.r_multiple,2)+'R';$('currentStop').textContent=money(x.existing_stop);$('proposedStop').textContent=money(x.proposed_stop);$('applyStopBtn').disabled=!x.can_apply;$('positionLog').textContent=json(x)}catch(e){$('positionLog').textContent=e.message}}
async function reconcile(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/protection/reconcile/${s}`);$('positionLog').textContent=json(r)}catch(e){$('positionLog').textContent=e.message}}
async function repairPreview(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/protection/repair-preview/${s}`);state.repair=r.repair;$('repairBtn').disabled=false;$('positionLog').textContent=json(r)}catch(e){state.repair=null;$('repairBtn').disabled=true;$('positionLog').textContent=e.message}}
async function repair(){if(!state.repair||!confirm('Create SELL OCO protection in ALPACA PAPER?'))return;try{const r=await api('/api/protection/repair',{method:'POST',body:JSON.stringify({symbol:$('positionSymbol').value})});$('repairBtn').disabled=true;$('positionLog').textContent=json(r);await refreshAll()}catch(e){$('positionLog').textContent=e.message}}
async function applyStop(){if(!state.dynamic?.can_apply||!confirm('Apply proposed stop to linked PAPER protective orders?'))return;try{const r=await api('/api/position/apply-stop',{method:'POST',body:JSON.stringify({symbol:$('positionSymbol').value,new_stop_price:state.dynamic.proposed_stop,order_id:''})});$('positionLog').textContent=json(r);await dynamicExit();await monitor()}catch(e){$('positionLog').textContent=e.message}}
async function closePosition(){const s=$('positionSymbol').value;if(!s||!confirm(`Close ${s} position in ALPACA PAPER?`))return;try{const r=await api('/api/position/close',{method:'POST',body:JSON.stringify({symbol:s})});$('positionLog').textContent=json(r);await refreshAll()}catch(e){$('positionLog').textContent=e.message}}
async function monitor(){try{const r=await api('/api/protection/monitor');const m=r.monitor||{};$('monitorOverall').textContent='Overall: '+(m.overall_status||'—');$('monitorOverall').className='pill '+(m.overall_status==='ALL_PROTECTED'?'ok':m.overall_status==='CRITICAL'?'bad':'warn');$('monPositions').textContent=m.position_count||0;$('monProtected').textContent=m.protected_count||0;$('monWarnings').textContent=m.warning_count||0;$('monCritical').textContent=m.critical_count||0;$('monitorBody').innerHTML=(m.rows||[]).map(x=>`<tr><td><b>${esc(x.symbol)}</b></td><td>${x.qty}</td><td>${x.protected_qty}</td><td>${num(x.coverage_pct,1)}</td><td>${x.unprotected_qty}</td><td>${x.overprotected_qty}</td><td>${esc(x.status)}</td><td class="${x.severity==='CRITICAL'?'loss':x.severity==='OK'?'profit':''}">${esc(x.severity)}</td><td>${x.valid_groups}</td><td>${x.unlinked_exits}</td><td>${x.historical_anomaly_count}</td></tr>`).join('')||'<tr><td colspan="11">No positions.</td></tr>'}catch(e){$('monitorOverall').textContent='Overall: ERROR';$('monitorOverall').className='pill bad'}}
function toggleMonitor(){if(state.monitorTimer){clearInterval(state.monitorTimer);state.monitorTimer=null;$('monitorToggleBtn').textContent='START AUTO MONITOR';return}monitor();const sec=Number($('monitorInterval').value);state.monitorTimer=setInterval(monitor,sec*1000);$('monitorToggleBtn').textContent='STOP AUTO MONITOR'}
async function refreshAll(){
 const results=await Promise.allSettled([health(),overview(),monitor()]);
 const names=['Health','Overview','Protection Monitor'];
 results.forEach((result,i)=>{
  if(result.status==='rejected'){
   const message=String(result.reason?.message||result.reason);
   console.error('OSE '+names[i]+' error:',result.reason);
   if(names[i]==='Overview'){
    $('systemLog').textContent='Overview loading error: '+message;
    $('portfolioValue').textContent='ERROR';
   }
  }
 });
}


// Swing Analytics: frontend-only preview. Does not change backend watchlist or execute orders.
const SWING_SYMBOLS=['SPY','NVDA','MSFT','AAPL','TSLA','GOOGL','ADBE','META','QCOM','AMZN','AVGO','CRWV','INTC','ORCL','PLTR'];
let swingRows=[];
function swingNum(v){const n=Number(v);return v===null||v===undefined||v===''||!Number.isFinite(n)?null:n}
function swingFmt(v,d=2){return v===null||v===undefined?'N/A':Number(v).toFixed(d)}
function swingCell(v){return esc(v===null||v===undefined?'N/A':String(v))}
async function loadSwing(){
 $('swingStatus').textContent='Loading 15 daily OHLCV analyses...';
 try {
  const capital=Number($('swingCapital').value),risk=Number($('swingRisk').value),cap=Number($('swingCap').value);
  const result=await api(`/api/swing/snapshot?capital=${encodeURIComponent(capital)}&risk_pct=${encodeURIComponent(risk)}&position_cap=${encodeURIComponent(cap)}`);
  swingRows=result.rows||[];renderSwing();
  $('swingSource').textContent=`Nguồn: ${result.data_source||'N/A'} · ${result.data_policy||''} · Điểm xếp hạng chỉ mô tả kỹ thuật, không phải xác suất thắng.`;
  $('swingStatus').textContent=`Loaded ${swingRows.filter(r=>!r.error).length}/15 · Data dates: ${(result.data_dates||[]).join(', ')||'none'} · ${result.aligned?'Aligned':'CAUTION: dates not aligned'} · Research only`;
 }catch(e){$('swingStatus').textContent='Error: '+e.message}
}
function renderSwing(){
 const keys=['rank','rank_score','symbol','price','ema20','ema50','rsi','atr','macd','status','entry','stop','tp1','tp2','qty'];
 $('swingBody').innerHTML=swingRows.map(r=>'<tr>'+keys.map(k=>'<td title="'+esc(r.error||'')+'">'+swingCell(typeof r[k]==='number'?swingFmt(r[k],(k==='qty'||k==='rank')?0:2):r[k])+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="15">Refresh to load data.</td></tr>';
}
function swingSave(filename,content,type){const blob=new Blob([content],{type});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function exportSwingCsv(){if(!swingRows.length){alert('Refresh first');return}const fields=['symbol','price','ema20','ema50','rsi','atr','macd','status','entry','stop','tp1','tp2','qty','rank','rank_score','asof','bars_used','error'];const csv=[fields.join(','),...swingRows.map(r=>fields.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(','))].join('\r\n');swingSave('swing_snapshot.csv',csv,'text/csv;charset=utf-8')}
function exportSwingReport(){
 if(!swingRows.length){alert('Hãy nhấn Refresh trước');return}
 const now=new Date().toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 const capital=Number($('swingCapital').value),risk=Number($('swingRisk').value),cap=Number($('swingCap').value);
 const valid=swingRows.filter(r=>!r.error).sort((a,b)=>(a.rank??999)-(b.rank??999));
 const dates=[...new Set(valid.map(r=>r.asof))];
 const fmt=v=>v===null||v===undefined?'N/A':String(v);
 const lines=[`BÁO CÁO SWING TRADING MỸ — BẢN NHÁP KỸ THUẬT v2.3`,`Thời điểm tạo (Việt Nam): ${now}`,
  `Ngày nến đã sử dụng: ${dates.join(', ')||'Không có'} · Đồng bộ: ${dates.length===1?'Có':'CHƯA'}`,
  'Nguồn: Alpaca IEX (không bao phủ toàn thị trường); loại nến trong ngày trước 16:30 New York.',
  'CHƯA XÁC MINH: SPX/Nasdaq/Dow/Russell, tin tức, lịch vĩ mô, earnings và các sự kiện doanh nghiệp.',
  `Vốn giả định: ${capital} USD · Rủi ro/lệnh: ${risk}% · Giới hạn vị thế: ${cap} USD`,
  '', 'XẾP HẠNG 15 MÃ (điểm mô tả, không phải xác suất sinh lời):',
  ...valid.map(r=>`${fmt(r.rank)}. ${r.symbol} | Điểm ${fmt(r.rank_score)}/100 | ${r.status} | Giá ${fmt(r.price)} | EMA20 ${fmt(r.ema20)} | EMA50 ${fmt(r.ema50)} | RSI14 ${fmt(r.rsi)} | ATR14 ${fmt(r.atr)} | MACD ${fmt(r.macd)} | Entry ${fmt(r.entry)} | SL ${fmt(r.stop)} | TP1 ${fmt(r.tp1)} | TP2 ${fmt(r.tp2)} | SL risk USD ${fmt(r.risk_usd)} | Số CP ${fmt(r.qty)}`),
  ...swingRows.filter(r=>r.error).map(r=>`${r.symbol}: KHÔNG CÓ DỮ LIỆU — ${r.error}`),
  '', 'CẢNH BÁO: Các mức Entry/SL/TP chỉ là kịch bản, không phải lệnh giao dịch.',
  'Không thực hiện mua/bán tự động. Cần xác minh dữ liệu thị trường đầy đủ, phiên giao dịch và sự kiện trước khi sử dụng.'];
 swingSave('bao_cao_swing_v2_3.txt','\uFEFF'+lines.join('\r\n'),'text/plain;charset=utf-8');
}
$('swingLoad').onclick=loadSwing;$('swingCsv').onclick=exportSwingCsv;$('swingReport').onclick=exportSwingReport;

for(const id of ['riskSymbol','riskEntry','riskQty','riskEntryType']){
 const control=$(id);
 control.addEventListener('input',invalidateRisk);
 control.addEventListener('change',invalidateRisk);
}
$('refreshAllBtn').onclick=refreshAll;$('healthBtn').onclick=health;$('configBtn').onclick=loadConfig;$('analyzeBtn').onclick=analyze;$('macroBtn').onclick=macro;$('sentimentBtn').onclick=sentiment;$('quoteBtn').onclick=paperQuote;$('submitOrderBtn').onclick=submitOrder;$('historyBtn').onclick=history;$('riskQuoteBtn').onclick=riskQuote;$('riskCalcBtn').onclick=calcRisk;$('useQtyBtn').onclick=useQty;$('gateBtn').onclick=gate;$('bracketBtn').onclick=bracket;$('positionRefreshBtn').onclick=dynamicExit;$('reconcileBtn').onclick=reconcile;$('repairPreviewBtn').onclick=repairPreview;$('repairBtn').onclick=repair;$('applyStopBtn').onclick=applyStop;$('closeBtn').onclick=closePosition;$('monitorNowBtn').onclick=monitor;$('monitorToggleBtn').onclick=toggleMonitor;

(async()=>{try{await loadConfig()}catch(e){$('systemLog').textContent='Config error: '+e.message}await refreshAll()})();

// Dashboard v2.4: read-only technical chart; no paper-order interaction.
let dashData=null, dashHover=-1, dashStarted=false;
const DASH_SYMBOLS=['SPY','NVDA','MSFT','AAPL','TSLA','GOOGL','ADBE','META','QCOM','AMZN','AVGO','CRWV','INTC','ORCL','PLTR'];
function dashboardActivate(){
 if(!dashStarted){dashStarted=true;const sel=$('dashSymbol');sel.innerHTML=DASH_SYMBOLS.map(s=>`<option value="${s}">${s}</option>`).join('');
  $('dashRefresh').onclick=dashboardLoad;
  for(const id of ['dashPeriod','dashChartType','dashEMA','dashBB','dashLevels','dashATR']) $(id).addEventListener('change',()=>{if(id==='dashPeriod')dashboardLoad();else dashboardDraw()});
  for(const id of ['dashPrice','dashVolume','dashMacd','dashRsi','dashAtr']){
   const c=$(id);c.addEventListener('pointermove',e=>{if(!dashData)return;const r=c.getBoundingClientRect();const n=dashData.visible.length;dashHover=Math.max(0,Math.min(n-1,Math.floor((e.clientX-r.left-52)/(r.width-68)*n)));dashboardDraw()});
   c.addEventListener('pointerleave',()=>{dashHover=-1;dashboardDraw()});
  }
  window.addEventListener('resize',()=>{if($('dashboard').classList.contains('active'))dashboardDraw()});
  dashboardLoad();
 }else dashboardDraw();
}
function dashEma(values,period){let v=null;return values.map((x,i)=>{if(i===period-1){v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;return v}if(v===null)return null;v=x*2/(period+1)+v*(1-2/(period+1));return v})}
function dashSma(values,n){return values.map((_,i)=>i<n-1?null:values.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n)}
function dashCalc(bars){
 const close=bars.map(b=>b.close), e12=dashEma(close,12),e26=dashEma(close,26);
 const macd=close.map((_,i)=>e12[i]===null||e26[i]===null?null:e12[i]-e26[i]);
 let signal=null;const sig=macd.map((x,i)=>{if(x===null)return null;if(signal===null){const prev=macd.slice(0,i+1).filter(v=>v!==null);if(prev.length<9)return null;signal=prev.slice(-9).reduce((a,b)=>a+b,0)/9;return signal}signal=x*.2+signal*.8;return signal});
 const gains=close.map((x,i)=>i?Math.max(0,x-close[i-1]):0),losses=close.map((x,i)=>i?Math.max(0,close[i-1]-x):0);
 let avgG=0,avgL=0;const rsi=close.map((_,i)=>{if(i<14)return null;if(i===14){avgG=gains.slice(1,15).reduce((a,b)=>a+b,0)/14;avgL=losses.slice(1,15).reduce((a,b)=>a+b,0)/14}else{avgG=(avgG*13+gains[i])/14;avgL=(avgL*13+losses[i])/14}return avgL===0?(avgG===0?50:100):100-100/(1+avgG/avgL)});
 const tr=bars.map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-(i?close[i-1]:b.close)),Math.abs(b.low-(i?close[i-1]:b.close))));
 let a=null;const atr=tr.map((x,i)=>{if(i<13)return null;if(i===13)a=tr.slice(0,14).reduce((v,w)=>v+w,0)/14;else a=(a*13+x)/14;return a});
 const mean=dashSma(close,20),std=close.map((_,i)=>i<19?null:Math.sqrt(close.slice(i-19,i+1).reduce((v,w)=>v+(w-mean[i])**2,0)/20));
 return bars.map((b,i)=>({...b,ema20:dashEma20[i],ema50:dashEma50[i],bbHigh:mean[i]===null?null:mean[i]+2*std[i],bbLow:mean[i]===null?null:mean[i]-2*std[i],macd:macd[i],signal:sig[i],hist:sig[i]===null?null:macd[i]-sig[i],rsi:rsi[i],atr:atr[i]}));
}
let dashEma20=[],dashEma50=[];
async function dashboardLoad(){
 const symbol=$('dashSymbol').value,days=Number($('dashPeriod').value);$('dashStatus').textContent='Loading '+symbol+'…';
 try{const response=await api(`/api/dashboard/${encodeURIComponent(symbol)}?days=${Math.min(520,days+110)}`);
 const bars=(response.bars||[]).map(b=>({...b,date:String(b.datetime).slice(0,10),open:+b.open,high:+b.high,low:+b.low,close:+b.close,volume:+b.volume})).filter(b=>[b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite));
 if(bars.length<35)throw Error('Insufficient closed daily candles for technical indicators');
 const close=bars.map(b=>b.close);dashEma20=dashEma(close,20);dashEma50=dashEma(close,50);
 const enriched=dashCalc(bars),latest=bars[bars.length-1].date;
 const cutoff=new Date(latest+'T12:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-days+1);
 const idx=enriched.findIndex(b=>b.date>=cutoff.toISOString().slice(0,10));const start=idx<0?0:idx;
 dashData={symbol,visible:enriched.slice(start),source:response.data_source};dashHover=-1;
 $('dashStatus').textContent=`${symbol} · ${dashData.visible.length} closed daily candles · latest ${latest} · ${response.data_source} · research only`;
 dashboardDraw();
 }catch(e){dashData=null;$('dashStatus').textContent='Chart unavailable: '+e.message;for(const id of ['dashPrice','dashVolume','dashMacd','dashRsi','dashAtr']){const c=$(id),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height)}$('dashMetrics').textContent='';}
}
function dashCanvas(id){
 const c=$(id),frame=c.parentElement;
 const heights={dashPrice:400,dashVolume:145,dashMacd:210,dashRsi:180,dashAtr:160};
 const h=heights[id]||180;
 frame.style.height=h+'px';frame.style.minHeight=h+'px';
 const w=Math.max(280,Math.floor(frame.getBoundingClientRect().width));
 const dpr=Math.min(window.devicePixelRatio||1,3);
 c.style.width='100%';c.style.height='100%';
 const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
 if(c.width!==pw)c.width=pw;
 if(c.height!==ph)c.height=ph;
 const ctx=c.getContext('2d');
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 return {ctx,w,h,left:52,right:w-16,top:16,bottom:h-28};
}
function dashPlot(id,series,opts={}){
 const {ctx,w,h,left,right,top,bottom}=dashCanvas(id),bars=dashData.visible,n=bars.length,plotW=right-left;
 let values=series.flatMap(s=>bars.map(b=>b[s.key]).filter(Number.isFinite));if(opts.candles)values.push(...bars.flatMap(b=>[b.high,b.low]));if(opts.levels)values.push(...opts.levels.map(x=>x.price));
 let min=opts.min??Math.min(...values),max=opts.max??Math.max(...values);if(!Number.isFinite(min)||!Number.isFinite(max))return;
 if(opts.zero){min=Math.min(min,0);max=Math.max(max,0)}if(max<=min){max=min+1}const pad=(max-min)*.06;min-=pad;max+=pad;
 const x=i=>left+(i+.5)*plotW/n,y=v=>bottom-(v-min)/(max-min)*(bottom-top);
 ctx.font='11px Segoe UI, sans-serif';ctx.textAlign='right';ctx.fillStyle='#667383';ctx.strokeStyle='#e7edf3';ctx.lineWidth=1;
 for(let j=0;j<=4;j++){const v=min+(max-min)*j/4,py=y(v);ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();ctx.fillText(v.toLocaleString(undefined,{maximumFractionDigits:opts.volume?0:2}),left-6,py+3)}
 if(opts.thresholds)for(const t of opts.thresholds){ctx.strokeStyle='#b6a2dc';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,y(t));ctx.lineTo(right,y(t));ctx.stroke();ctx.setLineDash([])}
 if(opts.zero){ctx.strokeStyle='#b6bec7';ctx.beginPath();ctx.moveTo(left,y(0));ctx.lineTo(right,y(0));ctx.stroke()}
 if(opts.candles){const candleW=Math.max(1,Math.min(9,plotW/n*.68));bars.forEach((b,i)=>{const color=b.close>=b.open?'#15956b':'#d85060';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x(i),y(b.low));ctx.lineTo(x(i),y(b.high));ctx.stroke();const a=y(Math.max(b.open,b.close)),z=y(Math.min(b.open,b.close));ctx.fillRect(x(i)-candleW/2,a,candleW,Math.max(1,z-a))})}
 if(opts.linePrice){series.unshift({key:'close',color:'#2179c4',width:2})}
 if(opts.histogram){const s=series.find(v=>v.key==='hist');bars.forEach((b,i)=>{const v=b.hist;if(!Number.isFinite(v))return;ctx.fillStyle=v>=0?'#58b7a1':'#e49a9f';ctx.fillRect(x(i)-Math.max(.5,plotW/n*.35),Math.min(y(v),y(0)),Math.max(1,plotW/n*.7),Math.max(1,Math.abs(y(v)-y(0))))});series=series.filter(v=>v.key!=='hist')}
 if(opts.bars)for(const s of series){bars.forEach((b,i)=>{const v=b[s.key];if(!Number.isFinite(v))return;ctx.fillStyle=s.colorFn?s.colorFn(b):s.color;const zero=opts.zero?y(0):bottom;ctx.fillRect(x(i)-Math.max(.5,plotW/n*.35),Math.min(y(v),zero),Math.max(1,plotW/n*.7),Math.max(1,Math.abs(y(v)-zero)))})}
 else for(const s of series){ctx.beginPath();ctx.strokeStyle=s.color;ctx.lineWidth=s.width||1.7;let begun=false;bars.forEach((b,i)=>{const v=b[s.key];if(!Number.isFinite(v)){begun=false;return}if(!begun)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));begun=true});ctx.stroke()}
 if(opts.levels)for(const level of opts.levels){ctx.strokeStyle=level.color;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(left,y(level.price));ctx.lineTo(right,y(level.price));ctx.stroke();ctx.setLineDash([]);ctx.textAlign='right';ctx.fillStyle=level.color;ctx.fillText(level.name+' '+level.price.toFixed(2),right-4,Math.max(top+9,Math.min(bottom-3,y(level.price)-3)))}
 const step=Math.max(1,Math.ceil(n/6));ctx.fillStyle='#738293';ctx.textAlign='center';for(let i=0;i<n;i+=step)ctx.fillText(bars[i].date.slice(5),x(i),h-7);
 if(dashHover>=0&&dashHover<n){ctx.strokeStyle='#8994a5';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x(dashHover),top);ctx.lineTo(x(dashHover),bottom);ctx.stroke();ctx.setLineDash([])}
}
function dashboardDraw(){if(!dashData)return;const b=dashData.visible,last=b[dashHover>=0?dashHover:b.length-1],fmt=v=>Number.isFinite(v)?v.toFixed(2):'—';
 $('dashMetrics').textContent=`${last.date}  O ${fmt(last.open)}  H ${fmt(last.high)}  L ${fmt(last.low)}  C ${fmt(last.close)}  Volume ${Math.round(last.volume).toLocaleString()}  RSI ${fmt(last.rsi)}  ATR ${fmt(last.atr)}  MACD ${fmt(last.macd)}`;
 const s=[];if($('dashEMA').checked)s.push({key:'ema20',color:'#e4a019'},{key:'ema50',color:'#8b5cf6'});if($('dashBB').checked)s.push({key:'bbHigh',color:'#8db9d8'},{key:'bbLow',color:'#8db9d8'});
 let levels=[];if($('dashLevels').checked){const row=typeof swingRows!=='undefined'?swingRows.find(r=>r.symbol===dashData.symbol&&!r.error):null;if(row)for(const [key,name,color] of [['entry','Entry','#1466b3'],['stop','Stop','#ce3c4c'],['tp1','TP1','#188a67'],['tp2','TP2','#188a67']])if(Number.isFinite(Number(row[key]))&&row[key]!=null)levels.push({price:Number(row[key]),name,color})}
 dashPlot('dashPrice',s,{candles:$('dashChartType').value==='candle',linePrice:$('dashChartType').value==='line',levels});
 dashPlot('dashVolume',[{key:'volume',color:'#16a085',colorFn:x=>x.close>=x.open?'#54bca1':'#e9a2a9'}],{bars:true,volume:true,min:0});
 // MACD histogram and two overlay lines share a common scale.
 dashPlot('dashMacd',[{key:'macd',color:'#1f2937'},{key:'signal',color:'#e35b45'},{key:'hist',color:'#16a085'}],{zero:true,histogram:true});
 dashPlot('dashRsi',[{key:'rsi',color:'#8b5cf6'}],{min:0,max:100,thresholds:[30,70]});
 $('dashAtrPanel').hidden=!$('dashATR').checked;if($('dashATR').checked)dashPlot('dashAtr',[{key:'atr',color:'#d48b22'}],{min:0});
}


// v2.5: read-only statistical forecast. No order endpoint calls.
let fcData=null, fcReady=false;
function forecastActivate(){
 if(!fcReady){fcReady=true;const sel=$('fcSymbol');sel.innerHTML=DASH_SYMBOLS.map(s=>`<option value="${s}">${s}</option>`).join('');
  $('fcRefresh').onclick=forecastLoad;forecastPerformanceInit();$('fcHorizon').onchange=forecastLoad;$('fcSymbol').onchange=()=>{forecastLoad();forecastPerformanceLoad();forecastReportLoad()};
  window.addEventListener('resize',()=>{if($('forecast').classList.contains('active'))forecastDraw()});forecastLoad();
 }else forecastDraw();
}
async function forecastLoad(){
 const sym=$('fcSymbol').value,h=Number($('fcHorizon').value);$('fcStatus').textContent='Loading '+sym+'...';
 try{fcData=await api(`/api/forecast/${encodeURIComponent(sym)}?horizon=${h}`);
  const d=fcData,fmt=x=>Number.isFinite(Number(x))?Number(x).toFixed(2):'—';
  const pct=Number(d.expected_return_pct),prob=Number(d.model_probability_up);
  const tone=d.signal==='Buy'?'fc-positive':d.signal==='Sell'?'fc-negative':'fc-neutral';
  $('fcStatus').textContent=`${d.symbol} · Last closed bar: ${d.asof} · ${d.horizon} trading sessions ahead`;
  const items=[['Signal',d.signal,tone],['Last close','$'+fmt(d.last_close),''],['Median return',(pct>0?'+':'')+fmt(pct)+'%',pct>0?'fc-positive':pct<0?'fc-negative':''],['Model P(up)',fmt(prob*100)+'%',''],['Swing score',d.swing_score??'N/A','']];
  $('fcMetrics').innerHTML=items.map(([k,v,cl])=>`<div class="fc-kpi"><div class="fc-kpi-label">${esc(k)}</div><div class="fc-kpi-value ${cl}">${esc(v)}</div></div>`).join('');
  $('fcTable').innerHTML=d.forecast.map(p=>`<tr>${[p.session,p.median,p.low80,p.high80,p.low95,p.high95].map((v,i)=>`<td>${i?esc(fmt(v)):esc(v)}</td>`).join('')}</tr>`).join('');
  const yesno=x=>x?'<span class="fc-confirm yes">Confirmed</span>':'<span class="fc-confirm no">Not confirmed</span>';
  $('fcSignalDetail').innerHTML=`<div class="fc-signal ${tone}">${esc(d.signal)}</div><div class="fc-insight-row"><span>EMA trend</span>${yesno(d.reasons?.trend_confirmed)}</div><div class="fc-insight-row"><span>MACD / RSI momentum</span>${yesno(d.reasons?.momentum_confirmed)}</div><div class="fc-insight-row"><span>Swing score</span><strong>${esc(d.swing_score??'N/A')}</strong></div><div class="fc-insight-row"><span>Horizon</span><strong>${esc(d.horizon)} sessions</strong></div><p class="fc-method">${esc(d.method)}</p>`;
  $('fcExplanation').textContent=`${d.assumptions}. ${d.disclaimer}`;
  forecastDraw();
 }catch(e){fcData=null;$('fcStatus').textContent='Forecast unavailable: '+e.message;$('fcMetrics').textContent='';$('fcTable').textContent='';$('fcSignalDetail').textContent='Forecast data unavailable.';forecastDraw()}
}
function forecastDraw(){
 const c=$('fcChart');if(!c)return;const frame=c.parentElement;const height=window.innerWidth<=650?340:410;frame.style.height=height+'px';frame.style.minHeight=height+'px';const width=Math.max(320,Math.floor(frame.getBoundingClientRect().width)),dpr=Math.min(window.devicePixelRatio||1,3);
 c.style.width='100%';c.style.height='100%';const pw=Math.round(width*dpr),ph=Math.round(height*dpr);if(c.width!==pw)c.width=pw;if(c.height!==ph)c.height=ph;
 const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);if(!fcData)return;
 const hist=fcData.historical_closes.map(x=>x.close),future=fcData.forecast;const n=hist.length,total=n+future.length;
 const vals=[...hist,...future.flatMap(x=>[x.low95,x.high95])];let lo=Math.min(...vals),hi=Math.max(...vals);const pad=(hi-lo)*.12||1;lo-=pad;hi+=pad;
 const L=56,R=18,T=20,B=35,X=i=>L+(i/(total-1))*(width-L-R),Y=v=>T+(hi-v)/(hi-lo)*(height-T-B);
 ctx.font='12px sans-serif';ctx.strokeStyle='#8895a4';ctx.fillStyle='#8895a4';ctx.lineWidth=1;
 for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k,y=Y(v);ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(width-R,y);ctx.stroke();ctx.globalAlpha=1;ctx.fillText(v.toFixed(2),3,y+4)}
 function band(lower,upper,color){ctx.beginPath();ctx.moveTo(X(n-1),Y(hist[n-1]));future.forEach((p,j)=>ctx.lineTo(X(n+j),Y(p[upper])));for(let j=future.length-1;j>=0;j--)ctx.lineTo(X(n+j),Y(future[j][lower]));ctx.closePath();ctx.fillStyle=color;ctx.fill()}
 band('low95','high95','rgba(16,185,129,.10)');band('low80','high80','rgba(16,185,129,.20)');
 ctx.strokeStyle='#64748b';ctx.lineWidth=2;ctx.beginPath();hist.forEach((v,i)=>i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));ctx.stroke();
 ctx.strokeStyle='#059669';ctx.lineWidth=2.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(X(n-1),Y(hist[n-1]));future.forEach((p,j)=>ctx.lineTo(X(n+j),Y(p.median)));ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#8895a4';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(X(n-1),T);ctx.lineTo(X(n-1),height-B);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#8895a4';ctx.fillText('Historical',L,height-8);ctx.fillText('Forecast',Math.max(L,X(n-1)-28),height-8);
}

// v2.5.2: forecast audit trail; no paper-order calls.
function forecastPerformanceInit(){
 $('fcSave').onclick=forecastSave;
 $('fcScore').onclick=forecastScore;
 $('fcHistoryRefresh').onclick=forecastPerformanceLoad;
 $('fcReportRefresh').onclick=forecastReportLoad;
 $('fcExport').onclick=()=>{const s=$('fcSymbol').value;window.open(API+'/api/forecast/performance/export.csv?symbol='+encodeURIComponent(s),'_blank','noopener')};
 forecastPerformanceLoad();forecastReportLoad();
}
async function forecastSave(){
 if(!fcData){$('fcPerfStatus').textContent='Generate a forecast first.';return}
 try{const r=await api(`/api/forecast/${encodeURIComponent(fcData.symbol)}/save?horizon=${fcData.horizon}`,{method:'POST'});
 $('fcPerfStatus').textContent=r.created?`Saved forecast #${r.id}. Pending settlement.`:`Forecast #${r.id} already saved (immutable).`;await forecastPerformanceLoad(false);await forecastReportLoad()}
 catch(e){$('fcPerfStatus').textContent='Save failed: '+e.message}
}
async function forecastScore(){
 $('fcPerfStatus').textContent='Fetching closed bars and scoring pending forecasts...';
 try{const r=await api('/api/forecast/performance/score?symbol='+encodeURIComponent($('fcSymbol').value),{method:'POST'});
 const errs=Object.entries(r.errors||{}).map(([s,msg])=>s+': '+msg).join('; ');
 await forecastPerformanceLoad(false);await forecastReportLoad();$('fcPerfStatus').textContent=`Newly scored: ${r.scored}. `+(errs?'Data errors: '+errs:'Remaining pending forecasts require more closed sessions.')}
 catch(e){$('fcPerfStatus').textContent='Auto-score failed: '+e.message}
}
async function forecastPerformanceLoad(showMessage=true){
 try{const r=await api('/api/forecast/performance/history?symbol='+encodeURIComponent($('fcSymbol').value)+'&limit=300');const m=r.summary;
 const k=[['Saved',m.total],['Scored',m.scored],['Direction accuracy',m.direction_accuracy_pct==null?'—':m.direction_accuracy_pct+'%'],['MAE',m.mae_usd==null?'—':'$'+Number(m.mae_usd).toFixed(2)],['RMSE',m.rmse_usd==null?'—':'$'+Number(m.rmse_usd).toFixed(2)],['80% / 95% coverage',m.coverage80_pct==null?'—':m.coverage80_pct+'% / '+m.coverage95_pct+'%']];
 $('fcPerfMetrics').innerHTML=k.map(([a,b])=>`<div class="fc-perf-kpi"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');
 $('fcPerfTable').innerHTML=(r.rows||[]).map(x=>`<tr><td>${esc(x.asof)}</td><td>${esc(x.symbol)}</td><td>${esc(x.horizon)}</td><td>${esc(x.signal)}</td><td>${esc(x.status)}</td><td>${esc(Number(x.predicted_close).toFixed(2))}</td><td>${x.actual_close==null?'—':esc(Number(x.actual_close).toFixed(2))}</td><td>${esc(x.target_date||'—')}</td><td>${x.direction_correct==null?'—':x.direction_correct?'Correct':'Incorrect'}</td><td>${x.abs_error==null?'—':esc(Number(x.abs_error).toFixed(2))}</td></tr>`).join('')||'<tr><td colspan="10">No saved forecasts for this symbol.</td></tr>';
 if(showMessage)$('fcPerfStatus').textContent=`${m.total} saved, ${m.scored} scored, ${m.pending} pending for ${$('fcSymbol').value}.`;
 }catch(e){$('fcPerfStatus').textContent='History unavailable: '+e.message}
}

// v2.5.3: read-only evaluation report; background job handles scoring independently.
async function forecastReportLoad(){
 const sym=$('fcSymbol').value;
 try{
  const [r,a]=await Promise.all([api('/api/forecast/performance/report?symbol='+encodeURIComponent(sym)),api('/api/forecast/performance/automation')]);
  const pct=v=>v==null?'—':Number(v).toFixed(1)+'%';
  const usd=v=>v==null?'—':Number(v).toFixed(2);
  $('fcReportHorizon').innerHTML=[3,5,10].map(h=>{const x=r.by_horizon[String(h)];return `<tr><td>${h}</td><td>${x.scored}</td><td>${pct(x.direction_accuracy_pct)}</td><td>${usd(x.mae_usd)}</td><td>${pct(x.coverage80_pct)} / ${pct(x.coverage95_pct)}</td></tr>`}).join('');
  $('fcReportSignal').innerHTML=['Buy','Hold','Sell'].map(sig=>{const x=r.by_signal[sig];return `<tr><td>${sig}</td><td>${x.scored}</td><td>${pct(x.direction_accuracy_pct)}</td><td>${usd(x.mae_usd)}</td></tr>`}).join('');
  $('fcAutomationStatus').textContent=`Auto-score: ${a.enabled?'Enabled':'Disabled'} · ${a.running?'Running':'Idle'} · Last completed: ${a.last_completed_at||'not yet'} · Last scored: ${a.last_scored} · Errors: ${Object.keys(a.last_errors||{}).length}`;
  $('fcReportNote').textContent=`Scored sample: ${r.sample_size}. ${r.sample_warning||'Sample threshold reached; results still not guaranteed.'} Model intervals are uncalibrated. No trading P&L is implied.`;
 }catch(e){$('fcReportNote').textContent='Report unavailable: '+e.message}
}
