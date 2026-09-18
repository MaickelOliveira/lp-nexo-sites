(() => {
  'use strict';
  const clamp = v => Math.max(0,Math.min(1,v));
  const range = (p,a,b) => clamp((p-a)/(b-a));
  const ease = p => { p=clamp(p); return p*p*(3-2*p); };
  const mix = (a,b,p) => a+(b-a)*p;
  // Pure, time-independent scene model. Reversing scroll retraces every frame.
  function heroFrame(value,mobile=false) {
    const p=clamp(value);
    const unlock=ease(range(p,.025,.165));
    const open=ease(range(p,.19,.345));
    const toCenter=ease(range(p,.165,.295));
    const enter=ease(range(p,.365,.61));
    const lime=ease(range(p,.53,.645));
    const paper=ease(range(p,.805,.905));
    const scenes=[
      1-ease(range(p,.155,.225)),
      ease(range(p,.225,.28))*(1-ease(range(p,.385,.455))),
      ease(range(p,.605,.665))*(1-ease(range(p,.785,.835))),
      ease(range(p,.89,.965))
    ];
    return {
      p,unlock,open,enter,lime,paper,scenes,
      chapter:p<.225?0:p<.605?1:p<.87?2:3,
      left:mix(mobile?50:76,50,toCenter),
      top:mix(mobile?54:53,57,toCenter)*(1-enter)+55*enter,
      scale:mix(1,mobile?1.48:.86,toCenter)*Math.pow(14,enter),
      ry:mix(-25,0,ease(range(p,.17,.405))),rx:mix(8,0,ease(range(p,.17,.405))),doorAngle:-108*open,wheelAngle:-138*unlock,
      vaultOpacity:1-ease(range(p,.575,.635)),
      glow:.12+unlock*.18+open*.45,
      light:p>=.62,
      desireX:1-ease(range(p,.605,.705)),
      invitationScale:mix(.88,1,ease(range(p,.865,.985)))
    };
  }
  if(typeof module!=='undefined' && module.exports) module.exports={heroFrame};
  if(typeof document==='undefined') return;
  const hero=document.querySelector('.nexo-hero');
  if(!hero) return;
  const $=s=>hero.querySelector(s), all=s=>[...hero.querySelectorAll(s)];
  const stage=$('.nx-stage'), scenes=all('[data-hero-scene]');
  const vault=$('.nx-vault'), perspective=$('.nx-vault-perspective');
  const door=$('.nx-vault-door'), wheel=$('.nx-vault-wheel');
  const glow=$('.nx-vault-glow');
  const lime=$('.nx-color-wipe'), paper=$('.nx-paper-wipe');
  const chapters=all('.nx-chapters span'), disciplines=all('.nx-discipline');
  const orbitOne=$('.nx-orbit-one'), orbitTwo=$('.nx-orbit-two');
  const first=$('.nx-desire-first'), last=$('.nx-desire-last');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const vaultImages=all('.nx-vault img');
  const ready=()=>vault.classList.toggle('is-ready',vaultImages.every(img=>img.complete&&img.naturalWidth>0));
  vaultImages.forEach(img=>img.addEventListener('load',ready));
  ready();
  let enabled=false;
  function configure(vh) {
    // Keep all essential content available at high zoom and in short landscape views.
    enabled=!reduced.matches && vh>=640;
    hero.classList.toggle('nx-enabled',enabled);
    // Natural content height catches enlarged type without relying on UA detection.
    if(enabled) {
      const opening=$('.nx-opening');
      const contentEnd=$('.nx-opening-bottom').offsetTop+$('.nx-opening-bottom').offsetHeight;
      const footerStart=$('.nx-bottom').offsetTop;
      const invitation=$('.nx-invitation');
      if(contentEnd>footerStart-12 || opening.scrollHeight>stage.clientHeight+3 || invitation.scrollHeight>stage.clientHeight+3) {
        enabled=false;
        hero.classList.remove('nx-enabled');
      }
    }
  }
  function paint(value,mobile) {
    const f=heroFrame(enabled?value:0,mobile);
    const immersive=hero.classList.contains('nx-webgl');
    const paperFinal=immersive?ease(range(f.p,.905,.955)):0;
    if(immersive) {
      // Carry the approved copy through the entrance instead of leaving an empty ride.
      const next=ease(range(f.p,.525,.585)),last=ease(range(f.p,.865,.94));
      f.scenes[1]=ease(range(f.p,.225,.28))*(1-next);
      f.scenes[2]=next*(1-last);
      f.scenes[3]=last;
      f.desireX=1-ease(range(f.p,.525,.625));
      f.invitationScale=mix(.94,1,last);
      f.chapter=f.p<.225?0:f.p<.555?1:f.p<.9?2:3;
    }
    hero.style.setProperty('--nx-progress',enabled?f.p:0);
    hero.style.setProperty('--nx-immersion',ease(range(f.p,.4,.51)));
    hero.style.setProperty('--nx-final-view',ease(range(f.p,.86,.95)));
    hero.style.setProperty('--nx-paper-final',paperFinal);
    const lightTone=immersive?paperFinal>.72:f.light;
    hero.classList.toggle('nx-paper-ending',immersive&&lightTone);
    hero.style.setProperty('--nx-ink',lightTone?'#233215':'#e3ecd7');
    hero.dataset.tone=lightTone?'light':'dark';
    lime.style.clipPath=`circle(${f.lime*150}% at 50% 55%)`;
    paper.style.clipPath=`circle(${f.paper*150}% at 80% 55%)`;
    scenes.forEach((el,i)=>{
      const shown=f.scenes[i]>.015;
      el.style.opacity=f.scenes[i];
      el.style.visibility=shown?'visible':'hidden';
      el.inert=!shown;
      if(i===0) el.style.transform=`translate3d(0,${-75*(1-f.scenes[0])}px,0) scale(${1-(1-f.scenes[0])*.035})`;
      if(i===1) el.style.transform=`translate3d(0,${(immersive&&f.p>.45?-120:24)*(1-f.scenes[1])}px,0)`;
      if(i===3) el.style.transform=`translate3d(0,${30*(1-f.scenes[3])}px,0) scale(${f.invitationScale})`;
    });
    vault.style.left=f.left+'%';vault.style.top=f.top+'%';
    vault.style.opacity=f.vaultOpacity;
    vault.style.visibility=f.vaultOpacity>.001?'visible':'hidden';
    vault.style.transform=`translate(-50%,-50%) scale(${f.scale})`;
    perspective.style.transform=`rotateX(${f.rx}deg) rotateY(${f.ry}deg)`;
    door.style.transform=`rotateY(${f.doorAngle}deg)`;
    wheel.style.transform=`translate(-50%,-50%) translateZ(16px) rotate(${f.wheelAngle}deg)`;
    glow.style.opacity=f.glow*(1-f.enter);
    vault.style.setProperty('--vault-unlock',f.unlock);
    disciplines.forEach((el,i)=>{
      const side=i===0?-1:i===2?1:0;
      el.style.transform=`translate3d(${side*(1-f.open)*(mobile?20:80)}px,${(1-f.open)*22}px,0)`;
    });
    orbitOne.style.transform=`translate(-50%,-50%) rotate(${-28+f.p*170}deg) scaleY(.7)`;
    orbitTwo.style.transform=`translate(-50%,-50%) rotate(${35-f.p*125}deg) scaleY(.6)`;
    orbitOne.style.opacity=orbitTwo.style.opacity=.25*(1-f.enter);
    first.style.transform=`translateX(${-f.desireX*(mobile?70:220)}px)`;
    last.style.transform=`translateX(${f.desireX*(mobile?65:190)}px)`;
    chapters.forEach((el,i)=>el.classList.toggle('is-current',i===f.chapter));
    $('[data-hero-count]').textContent=String(f.chapter+1).padStart(2,'0');
    window.nexoVault3D?.paint(f,mobile);
  }
  // The page's existing driver calls this controller: one scroll listener/paint loop.
  window.nexoHero={configure,paint,get enabled(){return enabled;},get stageHeight(){return stage.offsetHeight;}};
})();
