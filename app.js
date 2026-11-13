const API=(window.APP_CONFIG?.API_BASE_URL||'').replace(/\/$/,'');
const $=id=>document.getElementById(id);
const money=x=>Number.isFinite(Number(x))?`${Number(x)>0?'+':''}$${Number(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';
const num=(x,d=2)=>Number.isFinite(Number(x))?Number(x).toFixed(d):'—';
const pct=x=>Number.isFinite(Number(x))?`${Number(x)*100>=0?'+':''}${(Number(x)*100).toFixed(2)}%`:'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={config:null,analysis:null,risk:null,gate:null,dynamic:null,repair:null,monitorTimer:null,lastBracketId:null};

async function api(path,opts={}){const r=await fetch(API+path,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let data;try{data=await r.json()}catch{data={detail:await r.text()}}if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);return data}
function setPnl(el,v){el.textContent=money(v);el.classList.remove('profit','loss');if(Number(v)>0.005)el.classList.add('profit');if(Number(v)<-0.005)el.classList.add('loss')}
function json(x){return JSON.stringify(x,null,2)}
function kv(el,obj){el.innerHTML=Object.entries(obj||{}).map(([k,v])=>`<div class="kv"><b>${esc(k)}</b>${esc(typeof v==='object'?JSON.stringify(v):v)}</div>`).join('')||'<div class="kv">No data</div>'}
function optionize(select,items){const old=select.value;select.innerHTML=items.map(x=>`<option>${esc(x)}</option>`).join('');if(items.includes(old))select.value=old}

for(const b of document.querySelectorAll('.tab')) b.onclick=()=>{document.querySelectorAll('.tab,.tabpane').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')};

async function loadConfig(){const c=await api('/api/config');state.config=c;const list=[...new Set([...(c.watchlist||[]),...SWING_SYMBOLS])];['researchSymbol','sentimentSymbol','tradeSymbol','riskSymbol'].forEach(id=>optionize($(id),list));$('systemLog').textContent=json(c);return c}
async function health(){try{const h=await api('/api/health');$('systemStatus').textContent=h.ok?'System: PASS':'System: CHECK';$('systemStatus').className='pill '+(h.ok?'ok':'warn');$('systemLog').textContent=json(h);$('paperStatus').textContent=h.checks?.paper_account?'Alpaca: PAPER':'Alpaca: CHECK';$('paperStatus').className='pill '+(h.checks?.paper_account?'ok':'bad')}catch(e){$('systemStatus').textContent='System: ERROR';$('systemStatus').className='pill bad';$('systemLog').textContent=e.message}}
async function overview(){const [a,p,ps]=await Promise.all([api('/api/account'),api('/api/positions'),api('/api/pnl')]);const ac=a.account||{};$('portfolioValue').textContent=money(ac.portfolio_value);$('cashValue').textContent=money(ac.cash);$('buyingPower').textContent=money(ac.buying_power);const pn=ps.pnl||{};setPnl($('realizedPnl'),pn.realized_pl);setPnl($('unrealizedPnl'),pn.unrealized_pl);setPnl($('totalPnl'),pn.total_pl);$('pnlStatus').textContent=pn.status||'—';$('pnlStatus').className='metric '+(pn.status==='PROFIT'?'profit':pn.status==='LOSS'?'loss':'');const rows=p.positions||[];$('positionsBody').innerHTML=rows.map(x=>`<tr><td><b>${esc(x.symbol)}</b></td><td>${esc(x.qty)}</td><td>${money(x.entry_price)}</td><td>${money(x.current_price)}</td><td>${money(x.market_value)}</td><td class="${Number(x.unrealized_pl)>=0?'profit':'loss'}">${money(x.unrealized_pl)}</td><td class="${Number(x.unrealized_pl_pct)>=0?'profit':'loss'}">${pct(x.unrealized_pl_pct)}</td></tr>`).join('')||'<tr><td colspan="7">No open positions.</td></tr>';optionize($('positionSymbol'),rows.map(x=>x.symbol));}
async function analyze(){const s=$('researchSymbol').value,d=$('researchDays').value;$('researchReason').textContent='Analyzing…';try{const r=await api(`/api/research/${encodeURIComponent(s)}?days=${d}`);state.analysis=r.analysis;const a=r.analysis||{};$('signalValue').textContent=a.signal||'—';$('signalValue').className='metric '+(a.signal==='BUY'?'profit':a.signal==='SELL'?'loss':'');$('signalStrength').textContent=num(a.strength,2);$('signalQuality').textContent=num(a.quality,2);$('signalPrice').textContent=money(a.indicators?.close);$('researchReason').textContent=a.reasoning||'—';kv($('indicatorGrid'),a.indicators||{});kv($('researchDiagnostics'),{...(r.diagnostics||{}),buy_score:a.buy_score,sell_score:a.sell_score,macro_score:a.macro_score,sentiment_raw:a.sentiment_score,sentiment_adjustment:a.sentiment_adjustment})}catch(e){$('researchReason').textContent=e.message}}
async function macro(){try{const r=await api('/api/macro');kv($('macroGrid'),r.macro||{})}catch(e){$('macroGrid').textContent=e.message}}
async function sentiment(){try{const r=await api(`/api/sentiment/${$('sentimentSymbol').value}`);kv($('sentimentGrid'),r.sentiment||{})}catch(e){$('sentimentGrid').textContent=e.message}}
async function quote(symbol,targets){const r=await api(`/api/quote/${symbol}`);const q=r.quote||{};targets(q);return q}
async function paperQuote(){try{await quote($('tradeSymbol').value,q=>{$('quoteValue').textContent=money(q.reference_price);$('quoteDetail').textContent=`Bid ${money(q.bid_price)} · Ask ${money(q.ask_price)}`})}catch(e){$('paperLog').textContent=e.message}}
async function submitOrder(){if(!confirm('Submit this PAPER order?'))return;try{const body={symbol:$('tradeSymbol').value,qty:Number($('tradeQty').value),side:$('tradeSide').value,order_type:$('tradeType').value,limit_price:Number($('tradeLimit').value||0)};const r=await api('/api/orders',{method:'POST',body:JSON.stringify(body)});$('paperLog').textContent=json(r);await refreshAll()}catch(e){$('paperLog').textContent=e.message}}
async function history(){try{const r=await api('/api/orders/history?limit=200');$('historyBody').innerHTML=(r.orders||[]).map(o=>`<tr><td>${esc(o.filled_at||o.created_at||'')}</td><td>${esc(o.symbol)}</td><td>${esc(o.side)}</td><td>${esc(o.type)}</td><td>${esc(o.qty)}</td><td>${esc(o.filled_qty)}</td><td>${money(o.filled_avg_price)}</td><td>${esc(o.status)}</td><td>${esc(o.order_id)}</td></tr>`).join('')||'<tr><td colspan="9">No orders.</td></tr>'}catch(e){alert(e.message)}}
async function riskQuote(){try{await quote($('riskSymbol').value,q=>{$('riskEntry').value=Number(q.reference_price||0).toFixed(2);$('riskLog').textContent=`IEX reference: ${money(q.reference_price)}`})}catch(e){$('riskLog').textContent=e.message}}
async function calcRisk(){try{const a=state.analysis||{};const body={symbol:$('riskSymbol').value,entry_price:Number($('riskEntry').value),signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const r=await api('/api/risk/preview',{method:'POST',body:JSON.stringify(body)});state.risk=r.risk;state.gate=null;$('riskAtr').textContent=num(r.risk.atr,2);$('riskStop').textContent=money(r.risk.stop_price);$('riskTake').textContent=money(r.risk.take_profit_price);$('riskRecommended').textContent=r.risk.recommended_qty;$('gateStatus').textContent='Gate: NOT RUN';$('gateStatus').className='pill neutral';$('bracketBtn').disabled=true;$('riskLog').textContent=json(r.risk)}catch(e){$('riskLog').textContent=e.message}}
function useQty(){if(state.risk)$('riskQty').value=state.risk.recommended_qty||1}
async function gate(){if(!state.risk){alert('Calculate Adaptive Risk first.');return}try{const a=state.analysis||{};const body={symbol:$('riskSymbol').value,qty:Number($('riskQty').value),entry_price:Number($('riskEntry').value),signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const r=await api('/api/risk/gate',{method:'POST',body:JSON.stringify(body)});state.gate=r.gate;const pass=!!r.gate.passed;$('gateStatus').textContent='Gate: '+(pass?'PASS':'FAIL');$('gateStatus').className='pill '+(pass?'ok':'bad');$('bracketBtn').disabled=!pass;$('riskLog').textContent=json(r)}catch(e){$('gateStatus').textContent='Gate: ERROR';$('gateStatus').className='pill bad';$('riskLog').textContent=e.message}}
async function bracket(){if(!state.gate?.passed)return;if(!confirm('Submit BUY BRACKET to ALPACA PAPER?'))return;try{const a=state.analysis||{},r=state.risk;const body={symbol:$('riskSymbol').value,qty:Number($('riskQty').value),entry_price:Number($('riskEntry').value),entry_type:$('riskEntryType').value,take_profit_price:r.take_profit_price,stop_loss_price:r.stop_price,signal_strength:Number(a.strength||0),signal_quality:Number(a.quality||0)};const x=await api('/api/orders/bracket',{method:'POST',body:JSON.stringify(body)});state.lastBracketId=x.order?.order_id||x.order?.id||null;$('riskLog').textContent=json(x);await refreshAll()}catch(e){$('riskLog').textContent=e.message}}
async function dynamicExit(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/position/dynamic-exit/${s}`);state.dynamic=r.exit;const x=r.exit;$('exitPhase').textContent=x.dynamic_exit_phase||'—';$('rMultiple').textContent=num(x.r_multiple,2)+'R';$('currentStop').textContent=money(x.existing_stop);$('proposedStop').textContent=money(x.proposed_stop);$('applyStopBtn').disabled=!x.can_apply;$('positionLog').textContent=json(x)}catch(e){$('positionLog').textContent=e.message}}
async function reconcile(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/protection/reconcile/${s}`);$('positionLog').textContent=json(r)}catch(e){$('positionLog').textContent=e.message}}
async function repairPreview(){const s=$('positionSymbol').value;if(!s)return;try{const r=await api(`/api/protection/repair-preview/${s}`);state.repair=r.repair;$('repairBtn').disabled=false;$('positionLog').textContent=json(r)}catch(e){state.repair=null;$('repairBtn').disabled=true;$('positionLog').textContent=e.message}}
async function repair(){if(!state.repair||!confirm('Create SELL OCO protection in ALPACA PAPER?'))return;try{const r=await api('/api/protection/repair',{method:'POST',body:JSON.stringify({symbol:$('positionSymbol').value})});$('repairBtn').disabled=true;$('positionLog').textContent=json(r);await refreshAll()}catch(e){$('positionLog').textContent=e.message}}
async function applyStop(){if(!state.dynamic?.can_apply||!confirm('Apply proposed stop to linked PAPER protective orders?'))return;try{const r=await api('/api/position/apply-stop',{method:'POST',body:JSON.stringify({symbol:$('positionSymbol').value,new_stop_price:state.dynamic.proposed_stop,order_id:''})});$('positionLog').textContent=json(r);await dynamicExit();await monitor()}catch(e){$('positionLog').textContent=e.message}}
async function closePosition(){const s=$('positionSymbol').value;if(!s||!confirm(`Close ${s} position in ALPACA PAPER?`))return;try{const r=await api('/api/position/close',{method:'POST',body:JSON.stringify({symbol:s})});$('positionLog').textContent=json(r);await refreshAll()}catch(e){$('positionLog').textContent=e.message}}
async function monitor(){try{const r=await api('/api/protection/monitor');const m=r.monitor||{};$('monitorOverall').textContent='Overall: '+(m.overall_status||'—');$('monitorOverall').className='pill '+(m.overall_status==='ALL_PROTECTED'?'ok':m.overall_status==='CRITICAL'?'bad':'warn');$('monPositions').textContent=m.position_count||0;$('monProtected').textContent=m.protected_count||0;$('monWarnings').textContent=m.warning_count||0;$('monCritical').textContent=m.critical_count||0;$('monitorBody').innerHTML=(m.rows||[]).map(x=>`<tr><td><b>${esc(x.symbol)}</b></td><td>${x.qty}</td><td>${x.protected_qty}</td><td>${num(x.coverage_pct,1)}</td><td>${x.unprotected_qty}</td><td>${x.overprotected_qty}</td><td>${esc(x.status)}</td><td class="${x.severity==='CRITICAL'?'loss':x.severity==='OK'?'profit':''}">${esc(x.severity)}</td><td>${x.valid_groups}</td><td>${x.unlinked_exits}</td><td>${x.historical_anomaly_count}</td></tr>`).join('')||'<tr><td colspan="11">No positions.</td></tr>'}catch(e){$('monitorOverall').textContent='Overall: ERROR';$('monitorOverall').className='pill bad'}}
function toggleMonitor(){if(state.monitorTimer){clearInterval(state.monitorTimer);state.monitorTimer=null;$('monitorToggleBtn').textContent='START AUTO MONITOR';return}monitor();const sec=Number($('monitorInterval').value);state.monitorTimer=setInterval(monitor,sec*1000);$('monitorToggleBtn').textContent='STOP AUTO MONITOR'}
async function refreshAll(){await Promise.allSettled([health(),overview(),monitor()])}


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

$('refreshAllBtn').onclick=refreshAll;$('healthBtn').onclick=health;$('configBtn').onclick=loadConfig;$('analyzeBtn').onclick=analyze;$('macroBtn').onclick=macro;$('sentimentBtn').onclick=sentiment;$('quoteBtn').onclick=paperQuote;$('submitOrderBtn').onclick=submitOrder;$('historyBtn').onclick=history;$('riskQuoteBtn').onclick=riskQuote;$('riskCalcBtn').onclick=calcRisk;$('useQtyBtn').onclick=useQty;$('gateBtn').onclick=gate;$('bracketBtn').onclick=bracket;$('positionRefreshBtn').onclick=dynamicExit;$('reconcileBtn').onclick=reconcile;$('repairPreviewBtn').onclick=repairPreview;$('repairBtn').onclick=repair;$('applyStopBtn').onclick=applyStop;$('closeBtn').onclick=closePosition;$('monitorNowBtn').onclick=monitor;$('monitorToggleBtn').onclick=toggleMonitor;

(async()=>{try{await loadConfig()}catch(e){$('systemLog').textContent='Config error: '+e.message}await refreshAll()})();
