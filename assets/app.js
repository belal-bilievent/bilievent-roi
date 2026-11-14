(function(){
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
/* toasts */
let tw=$('.toasts'); if(!tw){tw=document.createElement('div');tw.className='toasts';tw.setAttribute('role','status');tw.setAttribute('aria-live','polite');document.body.appendChild(tw);}
window.toast=(html)=>{const t=document.createElement('div');t.className='toast';t.innerHTML=html;tw.appendChild(t);setTimeout(()=>t.remove(),3200);};
$$('[data-toast]').forEach(b=>b.addEventListener('click',e=>{if(b.tagName==='A'&&b.getAttribute('href')==='#')e.preventDefault();toast(b.dataset.toast);}));
/* mobile drawer (app) */
const side=$('.side'),scrim=$('.scrim'),menu=$('.menu');
if(menu&&side){const set=o=>{side.classList.toggle('open',o);scrim&&scrim.classList.toggle('open',o);menu.setAttribute('aria-expanded',o);};
 menu.addEventListener('click',()=>set(!side.classList.contains('open')));scrim&&scrim.addEventListener('click',()=>set(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false);});}
/* marketing mobile nav */
const mn=$('.mnav'),lk=$('.nav .lk');if(mn&&lk)mn.addEventListener('click',()=>{const o=lk.classList.toggle('open');mn.setAttribute('aria-expanded',o);});
/* popovers */
$$('[data-pop]').forEach(b=>{const p=document.getElementById(b.dataset.pop);b.addEventListener('click',e=>{e.stopPropagation();const o=p.classList.toggle('open');b.setAttribute('aria-expanded',o);});document.addEventListener('click',e=>{if(!p.contains(e.target)){p.classList.remove('open');b.setAttribute('aria-expanded',false);}});});
/* tabs: buttons with data-set="key" inside [data-tabs]; elements with data-k="key:value|key:value" update */
$$('[data-tabs]').forEach(g=>{const bs=$$('button',g);bs.forEach(b=>b.addEventListener('click',()=>{bs.forEach(x=>x.setAttribute('aria-selected',x===b));
 const k=b.dataset.set;$$('[data-v-'+g.dataset.tabs+']').forEach(el=>{const m=JSON.parse(el.getAttribute('data-v-'+g.dataset.tabs));if(m[k]!==undefined)el.innerHTML=m[k];});
 $$('[data-panel-'+g.dataset.tabs+']').forEach(p=>p.classList.toggle('on',p.getAttribute('data-panel-'+g.dataset.tabs)===k));
 if(g.dataset.filter){filterRows(g.dataset.filter,k);} }));});
/* segmented toggles */
$$('.seg[data-single]').forEach(s=>{const bs=$$('button',s);bs.forEach(b=>b.addEventListener('click',()=>bs.forEach(x=>x.setAttribute('aria-pressed',x===b))));});
$$('.seg:not([data-single]) button').forEach(b=>b.addEventListener('click',()=>b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')!=='true')));
/* switches */
$$('.sw').forEach(s=>s.addEventListener('click',()=>{const v=s.getAttribute('aria-checked')!=='true';s.setAttribute('aria-checked',v);toast((v?'Turned on: ':'Turned off: ')+'<b>'+s.dataset.name+'</b>');}));
/* clickable rows */
$$('tr[data-href]').forEach(r=>{r.tabIndex=0;r.addEventListener('click',e=>{if(e.target.closest('button,a'))return;location.href=r.dataset.href;});r.addEventListener('keydown',e=>{if(e.key==='Enter')location.href=r.dataset.href;});});
/* filtering + search */
let tier='all',q='';
function filterRows(id,t){if(t!==undefined)tier=t;const tb=document.getElementById(id);if(!tb)return;let n=0;
 $$('tr[data-tier]',tb).forEach(r=>{const ok=(tier==='all'||r.dataset.tier===tier)&&(!q||r.innerText.toLowerCase().includes(q));r.hidden=!ok;if(ok)n++;});
 const em=$('.empty[data-for="'+id+'"]');if(em)em.style.display=n?'none':'block';const c=$('[data-count="'+id+'"]');if(c)c.textContent=n;}
window.filterRows=filterRows;
const si=$('#q');if(si){const params=new URLSearchParams(location.search);const tgt=si.dataset.target;
 if(params.get('q')&&tgt){si.value=params.get('q');q=si.value.toLowerCase();filterRows(tgt);}
 si.addEventListener('input',()=>{q=si.value.toLowerCase().trim();if(tgt)filterRows(tgt);});
 si.addEventListener('keydown',e=>{if(e.key==='Enter'&&!tgt){location.href='leads.html?q='+encodeURIComponent(si.value);}});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();si.focus();}});}
/* sorting */
$$('th[aria-sort] button').forEach(b=>b.addEventListener('click',()=>{const th=b.closest('th'),tbl=th.closest('table'),i=[...th.parentNode.children].indexOf(th);
 const dir=th.getAttribute('aria-sort')==='descending'?'ascending':'descending';$$('th[aria-sort]',tbl).forEach(x=>x.setAttribute('aria-sort','none'));th.setAttribute('aria-sort',dir);
 const rows=$$('tbody tr',tbl);const val=r=>{const c=r.children[i];const v=c.dataset.v!==undefined?c.dataset.v:c.innerText;const n=parseFloat(String(v).replace(/[^0-9.\-]/g,''));return isNaN(n)?v:n;};
 rows.sort((a,b2)=>{const x=val(a),y=val(b2);return (x>y?1:x<y?-1:0)*(dir==='ascending'?1:-1);}).forEach(r=>r.parentNode.appendChild(r));}));
/* capture form */
const cf=$('#capture-form');if(cf){cf.addEventListener('submit',e=>{e.preventDefault();const co=$('#c-company').value||'New company',nm=$('#c-name').value||'New visitor';
 const tl=$('.seg[data-name=timeline] [aria-pressed=true]');const t=tl?tl.textContent:'';const score=t==='Now'?88:t==='This quarter'?79:t==='This year'?57:31;
 const cls=score>=75?'h':score>=40?'w':'c';const route=score>=75?'Rakan S. · now':score>=40?'Nurture · 7 days':'—';
 const now=new Date();const hh=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 const tb=$('#feed');const tr=document.createElement('tr');tr.className='hlrow';tr.innerHTML=`<td class="mono">${hh}</td><td class="who"><b>${nm}</b><span>${co}</span></td><td><span class="chip">Tablet</span></td><td><span class="sc ${cls}">${score}</span></td><td>${route}</td>`;tb.prepend(tr);
 const k=$('#k-today');if(k)k.textContent=(parseInt(k.textContent.replace(/,/g,''))+1).toLocaleString();if(score>=75){const h=$('#k-hot');if(h)h.textContent=parseInt(h.textContent)+1;}
 toast(`Lead saved · AI score <b>${score}</b> · ${score>=75?'routed to sales':'added to nurture'}`);cf.reset();});}
/* improvements approve */
$$('[data-approve]').forEach(b=>b.addEventListener('click',()=>{const p=b.closest('.rec').querySelector('.st');p.className='pill ok st';p.textContent='Approved';b.remove();toast('Change approved · <b>Bilievent</b> will schedule delivery');}));
/* ROI calculator */
const calc=$('#calc');if(calc){const f=n=>Math.round(n).toLocaleString('en-US');const ids=['cost','visitors','qual','deal','close'];
 const upd=()=>{const v={};ids.forEach(i=>{const el=$('#'+i);v[i]=parseFloat(el.value);const o=$('output[for='+i+']');if(o)o.textContent=(i==='qual'||i==='close')?el.value+'%':f(el.value);});
  const ql=v.visitors*v.qual/100, won=ql*v.close/100, rev=won*v.deal, roi=rev/v.cost;
  const ql2=ql*1.35, won2=ql2*(v.close*1.6)/100, rev2=won2*v.deal, roi2=rev2/(v.cost*1.08);
  $('#o-roi').textContent=roi.toFixed(1)+'×';$('#o-roi2').textContent=roi2.toFixed(1)+'×';$('#o-ql').textContent=f(ql);$('#o-cpql').textContent='SAR '+f(v.cost/ql);$('#o-rev').textContent='SAR '+f(rev);$('#o-rev2').textContent='SAR '+f(rev2);};
 ids.forEach(i=>$('#'+i).addEventListener('input',upd));upd();}
/* demo form -> email / WhatsApp */
const df=$('#demo-form');if(df){df.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(df));
 const body=`Name: ${d.name}\nCompany: ${d.company}\nRole: ${d.role}\nEmail: ${d.email}\nPhone: ${d.phone}\nNext exhibition: ${d.show}\nShows per year: ${d.shows}\n\n${d.msg||''}`;
 const via=e.submitter&&e.submitter.value==='wa'?'wa':'mail';
 if(via==='wa')window.open('https://wa.me/966551260551?text='+encodeURIComponent('Bilievent ROI demo request\n'+body),'_blank');
 else location.href='mailto:belal@bilievent.com?subject='+encodeURIComponent('Bilievent ROI demo request · '+d.company)+'&body='+encodeURIComponent(body);});}
})();
