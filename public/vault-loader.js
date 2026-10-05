(() => {
  const hero=document.querySelector('.nexo-hero');
  if(!hero)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let loading=false;
  function start() {
    if(loading||document.hidden||reduced.matches||navigator.connection?.saveData||!hero.classList.contains('nx-enabled'))return;
    loading=true;
    import('./vault-3d.js?v=perf2').catch(()=>{ /* Keep the working image/CSS fallback. */ });
  }
  const queue=()=>{if(loading)return;requestAnimationFrame(()=>{
    if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1600});
    else setTimeout(start,80);
  });};
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting))queue();
  },{rootMargin:'200px'});
  observer.observe(hero);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue();});
  reduced.addEventListener('change',queue);
  window.addEventListener('resize',queue,{passive:true});
  window.addEventListener('load',queue,{once:true});
  document.addEventListener('nexo:layout',queue);
})();
