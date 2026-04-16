const WA_NUMBER = '5573982284382';
    const DDD_VALIDOS = new Set(['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99']);
    const FIELD_LIMITS = { nome: 80, instagram: 80, empresa: 100, extras: 1000, referencia: 700, outro: 180, duration: 32, service: 80 };
    const FINAL_COOLDOWN_MS = 10000;
    const MIN_ELAPSED_MS = 3500;
    const state = {
      tipo: getInitialTipo(),
      currentIndex: 0,
      readyToSubmit: false,
      answers: {},
      startedAt: Date.now(),
      isSubmitting: false,
      submitLockedUntil: 0,
      lastSubmissionHash: '',
      finalError: ''
    };
    const stepsEl = document.getElementById('steps');
    const progressFill = document.getElementById('progress-fill');
    const progressLabel = document.getElementById('progress-label');
    function getInitialTipo(){
      if(window.__HAGAV_BUDGET_TIPO==='unica'||window.__HAGAV_BUDGET_TIPO==='recorrente') return window.__HAGAV_BUDGET_TIPO;
      const tipo=new URLSearchParams(window.location.search).get('tipo');
      return (tipo==='unica'||tipo==='recorrente')?tipo:'';
    }
    function getSteps(){if(state.tipo==='unica') return getStepsUnica(); if(state.tipo==='recorrente') return getStepsRecorrente(); return []}
    function getSelectedServices(){
      const raw=state.answers.unica_servicos;
      if(!raw||!Array.isArray(raw.selected)) return [];
      return raw.selected.map((item)=>{
        if(item!=='Outro') return sanitizeText(item,FIELD_LIMITS.service||80);
        const extra=sanitizeText(raw.outro||'',FIELD_LIMITS.outro);
        return extra?('Outro: '+extra):'Outro';
      });
    }
    function getRecordedYesServices(){const selected=getSelectedServices();const map=state.answers.unica_gravado||{};return selected.filter((service)=>map[service]==='Sim')}
    function getStepsUnica(){
      const selected=getSelectedServices();
      const withYes=getRecordedYesServices();
      return [
        {id:'unica_servicos',label:'Serviço necessário',title:'Qual serviço você precisa?',type:'multi',required:true,options:['Reels, TikTok e Shorts','Corte estratégico','Criativo para Ads','Outro'],outro:true},
        {id:'unica_quantidades',label:'Quantidade por serviço',title:'Quantidade por serviço selecionado',hint:'Preencha uma quantidade para cada serviço escolhido.',type:'quantityByService',required:true,services:selected},
        {id:'unica_gravado',label:'Material gravado',title:'O material já está gravado?',hint:'Responda para cada serviço selecionado.',type:'yesNoByService',required:true,services:selected},
        {id:'unica_tempo_bruto',label:'Tempo de material bruto',title:'Quanto tempo de material bruto para edição?',hint:'Somente para serviços com material gravado.',type:'durationByService',required:withYes.length>0,optionalWhenEmpty:true,services:withYes},
        {id:'unica_referencia',label:'Referência visual',title:'Tem referência visual?',hint:'Envie link de referência do Instagram, YouTube, TikTok ou Meta Ads. Ou pule.',type:'textarea',required:false,placeholder:'Cole links ou descreva referências...'},
        {id:'unica_prazo',label:'Prazo ideal',title:'Qual o prazo ideal?',type:'single',required:true,options:['24h','3 dias','Essa semana','Sem pressa']},
        {id:'nome',label:'Nome',title:'Qual é o seu nome?',type:'text',required:true,placeholder:'Digite seu nome'},
        {id:'whatsapp',label:'WhatsApp',title:'Qual o seu WhatsApp?',type:'phone',required:true,placeholder:'(00) 00000-0000'},
        {id:'instagram',label:'Instagram',title:'Qual o seu Instagram?',type:'text',required:false,placeholder:'@seuperfil'},
        {id:'extras',label:'Observações extras',title:'Observações extras',type:'textarea',required:false,placeholder:'Algo que você queira complementar...'}
      ].filter((step)=>!(step.optionalWhenEmpty&&(!step.services||step.services.length===0)));
    }
    function getStepsRecorrente(){
      return [
        {id:'rec_tipo_operacao',label:'Tipo de operação',title:'Qual tipo de operação você precisa?',type:'single',required:true,options:['Conteúdo para redes sociais','Criativos para anúncios','Escala de conteúdo','Lançamentos','YouTube recorrente','Estrutura completa','Outro'],outro:true},
        {id:'rec_volume',label:'Volume mensal',title:'Quantos conteúdos por mês você precisa?',type:'single',required:true,options:['5 a 10','10 a 20','20 a 40','40+','Ainda não sei']},
        {id:'rec_objetivo',label:'Objetivo principal',title:'Qual seu principal objetivo?',type:'single',required:true,options:['Vender mais','Crescer autoridade','Ganhar consistência','Escalar operação','Outro'],outro:true},
        {id:'rec_gravado',label:'Material gravado',title:'Você já possui material gravado?',type:'single',required:true,options:['Sim','Não','Parcialmente']},
        {id:'rec_inicio',label:'Prazo para começar',title:'Qual o prazo para começar?',type:'single',required:true,options:['Imediato','Essa semana','Esse mês','Estou analisando']},
        {id:'nome',label:'Nome',title:'Qual é o seu nome?',type:'text',required:true,placeholder:'Digite seu nome'},
        {id:'whatsapp',label:'WhatsApp',title:'Qual o seu WhatsApp?',type:'phone',required:true,placeholder:'(00) 00000-0000'},
        {id:'instagram',label:'Instagram',title:'Qual o seu Instagram?',type:'text',required:true,placeholder:'@seuperfil'},
        {id:'empresa',label:'Empresa / Marca',title:'Qual sua empresa ou marca?',type:'text',required:false,placeholder:'Opcional'},
        {id:'extras',label:'Observações extras',title:'Observações extras',type:'textarea',required:false,placeholder:'Algo que você queira complementar...'}
      ];
    }
    function render(){
      if(!state.tipo){renderTypePicker();updateProgress(0,0);return}
      const steps=getSteps();
      if(steps.length===0){renderTypePicker();updateProgress(0,0);return}
      if(state.readyToSubmit){
        stepsEl.innerHTML='';
        steps.forEach((step)=>{
          const done=document.createElement('article');
          done.className='step-done';
          done.innerHTML='<span class=\"label\">'+escapeHtml(step.label)+'</span><span class=\"ok\">✓</span>';
          stepsEl.appendChild(done);
        });
        const submitCard=document.createElement('article');
        submitCard.className='step-active';
        submitCard.innerHTML='<button class=\"step-back\" type=\"button\" id=\"go-back-final\">Voltar</button>'+
          '<h2 class=\"step-title\">'+(state.tipo==='unica'?'Tudo certo para enviar seu orçamento':'Tudo certo para enviar sua proposta')+'</h2>'+
          '<p class=\"step-hint\">Revise rapidamente e clique para abrir o WhatsApp com todas as respostas organizadas.</p>'+
          '<div class=\"bot-trap\" aria-hidden=\"true\"><input type=\"text\" id=\"spam-trap\" tabindex=\"-1\" autocomplete=\"off\" inputmode=\"text\" /></div>'+
          '<p class=\"submit-note\">Proteção anti-spam ativa para manter o atendimento rápido e seguro.</p>'+
          '<div class=\"error\" id=\"submit-error\"></div>'+
          '<button class=\"btn-submit\" type=\"button\" id=\"final-submit\">'+(state.tipo==='unica'?'Solicitar orçamento no WhatsApp':'Solicitar proposta no WhatsApp')+'</button>';
        stepsEl.appendChild(submitCard);
        submitCard.querySelector('#go-back-final').addEventListener('click',()=>{state.readyToSubmit=false;state.currentIndex=Math.max(0,steps.length-1);state.finalError='';render();});
        submitCard.querySelector('#final-submit').addEventListener('click',()=>handleFinalSubmit(submitCard));
        if(state.finalError){
          const errorEl=submitCard.querySelector('#submit-error');
          errorEl.textContent=state.finalError;
          errorEl.style.display='block';
        }
        updateProgress(steps.length,steps.length);
        return;
      }
      if(state.currentIndex<0) state.currentIndex=0;
      if(state.currentIndex>steps.length-1) state.currentIndex=steps.length-1;
      stepsEl.innerHTML='';
      const active=steps[state.currentIndex];
      for(let i=0;i<state.currentIndex;i++){
        const done=document.createElement('article');
        done.className='step-done';
        done.innerHTML='<span class="label">'+escapeHtml(steps[i].label)+'</span><span class="ok">✓</span>';
        stepsEl.appendChild(done);
      }
      const activeCard=document.createElement('article');
      activeCard.className='step-active';
      activeCard.innerHTML=buildActiveStepMarkup(active,state.currentIndex>0);
      stepsEl.appendChild(activeCard);
      attachStepEvents(active,activeCard);
      updateProgress(state.currentIndex+1,steps.length);
    }
    function renderTypePicker(){
      stepsEl.innerHTML='';
      const picker=document.createElement('article');
      picker.className='type-picker';
      picker.innerHTML='<h2>Escolha o tipo de orçamento</h2>'+
        '<button class="opt" data-set-tipo="unica"><span class="opt-row"><span>Demanda Única</span><span class="opt-check">→</span></span></button>'+
        '<button class="opt" data-set-tipo="recorrente"><span class="opt-row"><span>Demanda Recorrente</span><span class="opt-check">→</span></span></button>';
      picker.querySelectorAll('[data-set-tipo]').forEach((btn)=>{btn.addEventListener('click',()=>{setTipo(btn.getAttribute('data-set-tipo'));})});
      stepsEl.appendChild(picker);
    }
    function buildActiveStepMarkup(step,canGoBack){
      const hint=step.hint?'<p class="step-hint">'+escapeHtml(step.hint)+'</p>':'';
      const back=canGoBack?'<button class="step-back" type="button" id="go-back">Voltar</button>':'';
      const error='<div class="error" id="step-error"></div>';
      let body='';
      if(step.type==='text'||step.type==='phone'){
        const value=step.type==='phone'?formatPhone(state.answers[step.id]||''):(state.answers[step.id]||'');
        const maxLen=step.type==='phone'?15:getTextLimitForField(step.id);
        body='<input class="field" id="step-input" type="text" value="'+escapeAttr(value)+'" placeholder="'+escapeAttr(step.placeholder||'')+'" autocomplete="off" maxlength="'+maxLen+'" />';
      }
      if(step.type==='textarea'){
        const maxLen=step.id==='unica_referencia'?FIELD_LIMITS.referencia:FIELD_LIMITS.extras;
        body='<textarea class="textarea" id="step-input" placeholder="'+escapeAttr(step.placeholder||'')+'" maxlength="'+maxLen+'">'+escapeHtml(state.answers[step.id]||'')+'</textarea>';
      }
      if(step.type==='single'){
        const value=state.answers[step.id]||'';
        const otherText=(state.answers[step.id+'_outro']||'');
        body='<div class="options">'+step.options.map((opt)=>{const active=value===opt?' active':'';return '<button class="opt'+active+'" type="button" data-single="'+escapeAttr(opt)+'"><span class="opt-row"><span>'+escapeHtml(opt)+'</span><span class="opt-check">✓</span></span></button>';}).join('')+'</div>';
        if(step.outro){const show=value==='Outro'?'':' style="display:none"';body+='<div id="single-outro-wrap"'+show+'><input class="field" id="single-outro" type="text" placeholder="Descreva aqui..." value="'+escapeAttr(otherText)+'" maxlength="'+FIELD_LIMITS.outro+'" /></div>'}
      }
      if(step.type==='multi'){
        const current=state.answers[step.id]||{selected:[],outro:''};
        const selected=Array.isArray(current.selected)?current.selected:[];
        body='<div class="options">'+step.options.map((opt)=>{const active=selected.includes(opt)?' active':'';return '<button class="opt'+active+'" type="button" data-multi="'+escapeAttr(opt)+'"><span class="opt-row"><span>'+escapeHtml(opt)+'</span><span class="opt-check">✓</span></span></button>';}).join('')+'</div>';
        if(step.outro){const show=selected.includes('Outro')?'':' style="display:none"';body+='<div id="multi-outro-wrap"'+show+'><input class="field" id="multi-outro" type="text" placeholder="Descreva aqui..." value="'+escapeAttr(current.outro||'')+'" maxlength="'+FIELD_LIMITS.outro+'" /></div>'}
      }
      if(step.type==='quantityByService'){
        const values=state.answers[step.id]||{};
        body='<div class="grid-group">'+step.services.map((service)=>{const val=values[service]||'';return '<div class="group-row"><div class="group-label">'+escapeHtml(service)+'</div><input class="field qty-input" type="number" min="1" inputmode="numeric" data-qty="'+escapeAttr(service)+'" placeholder="Ex: 6" value="'+escapeAttr(val)+'" /></div>';}).join('')+'</div>';
      }
      if(step.type==='yesNoByService'){
        const map=state.answers[step.id]||{};
        body='<div class="grid-group">'+step.services.map((service)=>{const yesActive=map[service]==='Sim'?' active':'';const noActive=map[service]==='Não'?' active':'';return '<div class="group-row"><div class="group-label">'+escapeHtml(service)+'</div><div class="options"><button class="opt'+yesActive+'" type="button" data-yn="'+escapeAttr(service)+'|Sim">Sim</button><button class="opt'+noActive+'" type="button" data-yn="'+escapeAttr(service)+'|Não">Não</button></div></div>';}).join('')+'</div>';
      }
      if(step.type==='durationByService'){
        const map=state.answers[step.id]||{};
        body='<div class="grid-group">'+step.services.map((service)=>{const value=map[service]||'';return '<div class="group-row"><div class="group-label">'+escapeHtml(service)+'</div><input class="time-input" data-time-input="'+escapeAttr(service)+'" placeholder="45min" value="'+escapeAttr(value)+'" maxlength="'+FIELD_LIMITS.duration+'" /><div class="quick-times"><button class="quick-time" type="button" data-time="'+escapeAttr(service)+'|30 min">30 min</button><button class="quick-time" type="button" data-time="'+escapeAttr(service)+'|1h">1h</button><button class="quick-time" type="button" data-time="'+escapeAttr(service)+'|2h">2h</button></div></div>';}).join('')+'</div>';
      }
      const actions='<div class="actions"><button class="btn-main" type="button" id="go-next">Continuar →</button>'+(step.required?'':'<button class="btn-skip" type="button" id="go-skip">Pular</button>')+'</div>';
      return back+'<h2 class="step-title">'+escapeHtml(step.title)+'</h2>'+hint+body+error+actions;
    }
    function attachStepEvents(step,container){
      const errorEl=container.querySelector('#step-error');
      const backBtn=container.querySelector('#go-back');
      const nextBtn=container.querySelector('#go-next');
      const skipBtn=container.querySelector('#go-skip');
      if(backBtn){backBtn.addEventListener('click',()=>{state.currentIndex=Math.max(0,state.currentIndex-1);render();});}
      if(step.type==='phone'){const input=container.querySelector('#step-input');input.addEventListener('input',()=>{const digits=onlyDigits(input.value).slice(0,11);input.value=formatPhone(digits);});}
      if(step.type==='single'){
        const buttons=[...container.querySelectorAll('[data-single]')];
        buttons.forEach((btn)=>{btn.addEventListener('click',()=>{buttons.forEach((item)=>item.classList.remove('active'));btn.classList.add('active');const value=btn.getAttribute('data-single');if(step.outro){const wrap=container.querySelector('#single-outro-wrap');if(wrap)wrap.style.display=value==='Outro'?'':'none';}errorEl.style.display='none';});});
      }
      if(step.type==='multi'){
        const buttons=[...container.querySelectorAll('[data-multi]')];
        buttons.forEach((btn)=>{btn.addEventListener('click',()=>{btn.classList.toggle('active');if(step.outro){const activeOutro=buttons.find((item)=>item.getAttribute('data-multi')==='Outro'&&item.classList.contains('active'));const wrap=container.querySelector('#multi-outro-wrap');if(wrap)wrap.style.display=activeOutro?'':'none';}errorEl.style.display='none';});});
      }
      if(step.type==='yesNoByService'){
        const buttons=[...container.querySelectorAll('[data-yn]')];
        buttons.forEach((btn)=>{btn.addEventListener('click',()=>{const parts=btn.getAttribute('data-yn').split('|');const service=parts[0];buttons.filter((item)=>item.getAttribute('data-yn').startsWith(service+'|')).forEach((item)=>item.classList.remove('active'));btn.classList.add('active');errorEl.style.display='none';});});
      }
      if(step.type==='durationByService'){
        const quicks=[...container.querySelectorAll('[data-time]')];
        quicks.forEach((btn)=>{btn.addEventListener('click',()=>{const parts=btn.getAttribute('data-time').split('|');const service=parts[0];const val=parts[1];const input=container.querySelector('[data-time-input="'+cssEscape(service)+'"]');if(input)input.value=val;errorEl.style.display='none';});});
      }
      if(skipBtn){skipBtn.addEventListener('click',()=>{state.answers[step.id]='';if(step.outro) state.answers[step.id+'_outro']='';goToNext();});}
      nextBtn.addEventListener('click',()=>{const result=collectAndValidate(step,container);if(!result.ok){errorEl.textContent=result.error;errorEl.style.display='block';return;}state.answers[step.id]=result.value;if(result.extra){Object.keys(result.extra).forEach((key)=>{state.answers[key]=result.extra[key];});}goToNext();});
      container.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&event.target.tagName!=='TEXTAREA'){event.preventDefault();nextBtn.click();}});
    }
    function collectAndValidate(step,container){
      if(step.type==='text'){
        const raw=String(container.querySelector('#step-input').value||'');
        if(containsHtml(raw)) return fail('Não use HTML ou scripts neste campo.');
        const maxLen=getTextLimitForField(step.id);
        const value=sanitizeText(raw,maxLen);
        if(step.required&&!value) return fail('Preencha este campo para continuar.');
        if(value&&hasDangerousScheme(value)) return fail('Conteúdo inválido. Remova links inseguros.');
        return ok(value);
      }
      if(step.type==='phone'){const raw=onlyDigits(container.querySelector('#step-input').value||'');const check=validateBrazilPhone(raw);if(!check.ok) return fail(check.error);return ok(raw);}
      if(step.type==='textarea'){
        const raw=String(container.querySelector('#step-input').value||'');
        if(containsHtml(raw)) return fail('Não use HTML ou scripts neste campo.');
        const maxLen=step.id==='unica_referencia'?FIELD_LIMITS.referencia:FIELD_LIMITS.extras;
        const value=sanitizeText(raw,maxLen);
        if(step.required&&!value) return fail('Preencha este campo para continuar.');
        if(value&&hasDangerousScheme(value)) return fail(step.id==='unica_referencia'?'Referência inválida. Use apenas texto ou links seguros.':'Conteúdo inválido. Remova links inseguros.');
        return ok(value);
      }
      if(step.type==='single'){
        const active=container.querySelector('[data-single].active');
        const value=active?active.getAttribute('data-single'):'';
        if(step.required&&!value) return fail('Selecione uma opcao para continuar.');
        const extra={};
        if(step.outro){
          const outroInput=container.querySelector('#single-outro');
          const outroRaw=outroInput?String(outroInput.value||''):'';
          if(containsHtml(outroRaw)) return fail('Não use HTML no campo "Outro".');
          const outroValue=sanitizeText(outroRaw,FIELD_LIMITS.outro);
          if(value==='Outro'&&!outroValue) return fail('Descreva o campo "Outro" para continuar.');
          extra[step.id+'_outro']=outroValue;
        }
        return ok(value,extra);
      }
      if(step.type==='multi'){
        const actives=[...container.querySelectorAll('[data-multi].active')].map((item)=>item.getAttribute('data-multi'));
        if(step.required&&actives.length===0) return fail('Selecione pelo menos uma opcao.');
        const outroInput=container.querySelector('#multi-outro');
        const outroRaw=outroInput?String(outroInput.value||''):'';
        if(containsHtml(outroRaw)) return fail('Não use HTML no campo "Outro".');
        const outroValue=sanitizeText(outroRaw,FIELD_LIMITS.outro);
        if(actives.includes('Outro')&&!outroValue) return fail('Descreva o campo "Outro" para continuar.');
        return ok({selected:actives,outro:outroValue});
      }
      if(step.type==='quantityByService'){
        if(!step.services||step.services.length===0) return ok({});
        const map={};
        for(const service of step.services){const input=container.querySelector('[data-qty="'+cssEscape(service)+'"]');const raw=input?String(input.value||'').trim():'';const num=Number(raw);if(!raw||!Number.isInteger(num)||num<1) return fail('Informe uma quantidade válida para todos os serviços.');map[service]=num;}
        return ok(map);
      }
      if(step.type==='yesNoByService'){
        if(!step.services||step.services.length===0) return ok({});
        const map={};
        for(const service of step.services){
          const yes=container.querySelector('[data-yn="'+cssEscape(service)+'|Sim"]');
          const no=container.querySelector('[data-yn="'+cssEscape(service)+'|Não"]');
          if(yes&&yes.classList.contains('active')) map[service]='Sim';
          if(no&&no.classList.contains('active')) map[service]='Não';
          if(!map[service]) return fail('Responda se o material está gravado para todos os serviços.');
        }
        return ok(map);
      }
      if(step.type==='durationByService'){
        if(!step.services||step.services.length===0) return ok({});
        const map={};
        for(const service of step.services){
          const input=container.querySelector('[data-time-input="'+cssEscape(service)+'"]');
          const raw=input?String(input.value||''):'';
          if(containsHtml(raw)) return fail('Use somente texto simples no tempo de material.');
          const value=sanitizeText(raw,FIELD_LIMITS.duration);
          if(!value) return fail('Informe o tempo de material bruto para cada serviço listado.');
          map[service]=value;
        }
        return ok(map);
      }
      return ok('');
    }
    function goToNext(){const steps=getSteps();state.finalError='';if(state.currentIndex>=steps.length-1){state.readyToSubmit=true;render();return;}state.currentIndex+=1;render();}
    function updateProgress(current,total){const pct=total>0?Math.round((current/total)*100):0;progressFill.style.width=pct+'%';progressLabel.textContent=current+' / '+total;}
    async function handleFinalSubmit(container){
      const submitBtn=container.querySelector('#final-submit');
      const errorEl=container.querySelector('#submit-error');
      const honeypotInput=container.querySelector('#spam-trap');
      if(state.isSubmitting) return;
      const now=Date.now();
      if(now<state.submitLockedUntil){
        const waitSeconds=Math.ceil((state.submitLockedUntil-now)/1000);
        showSubmitError(errorEl,'Aguarde '+waitSeconds+'s antes de tentar novamente.');
        return;
      }
      if(now-state.startedAt<MIN_ELAPSED_MS){
        showSubmitError(errorEl,'Quase lá. Aguarde um instante e tente novamente.');
        return;
      }
      hideSubmitError(errorEl);
      const payload=buildSubmissionPayload(honeypotInput?honeypotInput.value:'');
      const payloadHash=JSON.stringify(payload.answers);
      if(state.lastSubmissionHash&&state.lastSubmissionHash===payloadHash){
          showSubmitError(errorEl,'Esse envio já foi validado. Abrindo WhatsApp...');
        openWhatsApp(payload.answers);
        return;
      }
      state.isSubmitting=true;
      submitBtn.disabled=true;
      const originalText=submitBtn.textContent;
      submitBtn.textContent='Enviando...';
      try{
        const response=await fetch('/api/validate-submit',{
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body:JSON.stringify(payload)
        });
        const data=await response.json().catch(()=>null);
        if(!response.ok||!data||!data.ok){
          const message=mapSubmitError(data&&data.error,response.status);
          showSubmitError(errorEl,message);
          state.submitLockedUntil=Date.now()+Math.min(FINAL_COOLDOWN_MS,3000);
          return;
        }
        state.lastSubmissionHash=payloadHash;
        state.submitLockedUntil=Date.now()+FINAL_COOLDOWN_MS;
        state.finalError='';
        openWhatsApp(payload.answers);
      }catch{
        showSubmitError(errorEl,'Falha de conexão. Verifique sua internet e tente novamente.');
      }finally{
        state.isSubmitting=false;
        submitBtn.disabled=false;
        submitBtn.textContent=originalText;
      }
    }
    function buildSubmissionPayload(honeypotValue){
      const answers=buildSanitizedAnswers();
      return {
        tipo: state.tipo,
        answers,
        honeypot: sanitizeText(honeypotValue,120),
        meta: { elapsedMs: Date.now()-state.startedAt }
      };
    }
    function buildSanitizedAnswers(){
      const raw=state.answers||{};
      const result={
        nome: sanitizeText(raw.nome||'',FIELD_LIMITS.nome),
        whatsapp: onlyDigits(raw.whatsapp||'').slice(0,11),
        instagram: sanitizeText(raw.instagram||'',FIELD_LIMITS.instagram),
        extras: sanitizeText(raw.extras||'',FIELD_LIMITS.extras)
      };
      if(state.tipo==='unica'){
        const servicos=raw.unica_servicos&&Array.isArray(raw.unica_servicos.selected)?raw.unica_servicos.selected:[];
        result.unica_servicos={selected:servicos,outro:sanitizeText((raw.unica_servicos&&raw.unica_servicos.outro)||'',FIELD_LIMITS.outro)};
        result.unica_quantidades=raw.unica_quantidades&&typeof raw.unica_quantidades==='object'?raw.unica_quantidades:{};
        result.unica_gravado=raw.unica_gravado&&typeof raw.unica_gravado==='object'?raw.unica_gravado:{};
        result.unica_tempo_bruto=raw.unica_tempo_bruto&&typeof raw.unica_tempo_bruto==='object'?raw.unica_tempo_bruto:{};
        result.unica_referencia=sanitizeText(raw.unica_referencia||'',FIELD_LIMITS.referencia);
        result.unica_prazo=sanitizeText(raw.unica_prazo||'',40);
      }else{
        result.rec_tipo_operacao=sanitizeText(raw.rec_tipo_operacao||'',120);
        result.rec_tipo_operacao_outro=sanitizeText(raw.rec_tipo_operacao_outro||'',FIELD_LIMITS.outro);
        result.rec_volume=sanitizeText(raw.rec_volume||'',60);
        result.rec_objetivo=sanitizeText(raw.rec_objetivo||'',120);
        result.rec_objetivo_outro=sanitizeText(raw.rec_objetivo_outro||'',FIELD_LIMITS.outro);
        result.rec_gravado=sanitizeText(raw.rec_gravado||'',40);
        result.rec_inicio=sanitizeText(raw.rec_inicio||'',50);
        result.empresa=sanitizeText(raw.empresa||'',FIELD_LIMITS.empresa);
      }
      return result;
    }
    function mapSubmitError(error,status){
      if(status===429) return 'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.';
      if(status===403) return 'Não foi possível concluir agora. Tente novamente.';
      if(status===503) return 'Serviço temporariamente indisponível. Tente novamente em instantes.';
      const key=String(error||'').toLowerCase();
      if(key.includes('whatsapp')) return 'WhatsApp inválido. Revise o número e tente novamente.';
      if(key.includes('referencia')) return 'Referência inválida. Use texto simples ou links seguros.';
      if(key.includes('spam')) return 'Não foi possível concluir agora. Tente novamente.';
      return 'Não foi possível validar os dados. Revise os campos e tente novamente.';
    }
    function showSubmitError(errorEl,message){if(!errorEl) return;state.finalError=message;errorEl.textContent=message;errorEl.style.display='block';}
    function hideSubmitError(errorEl){if(!errorEl) return;state.finalError='';errorEl.style.display='none';errorEl.textContent='';}
    function openWhatsApp(safeAnswers){
      const answers=safeAnswers||buildSanitizedAnswers();
      const name=(answers.nome||'').trim()||'Sem nome';
      const intro=state.tipo==='unica'?'Olá, me chamo '+name+'. Acabei de preencher o formulário de Demanda Única no site da HAGAV e gostaria de solicitar meu orçamento.':'Olá, me chamo '+name+'. Acabei de preencher o formulário de Demanda Recorrente no site da HAGAV e gostaria de solicitar uma proposta.';
      const lines=[intro,'','*Resumo das respostas*'];
      if(state.tipo==='unica'){
        const servicos=getSelectedServices();
        const qtd=answers.unica_quantidades||{};
        const gravado=answers.unica_gravado||{};
        const tempo=answers.unica_tempo_bruto||{};
        lines.push('• Serviços: '+(servicos.length?servicos.join(', '):'-'));
        if(servicos.length){
          lines.push('• Quantidades:');
          servicos.forEach((s)=>lines.push('  - '+s+': '+(qtd[s]||'-')));
          lines.push('• Material gravado:');
          servicos.forEach((s)=>lines.push('  - '+s+': '+(gravado[s]||'-')));
          if(Object.keys(tempo).length){lines.push('• Tempo bruto:');Object.keys(tempo).forEach((s)=>lines.push('  - '+s+': '+tempo[s]));}
        }
        lines.push('• Referência visual: '+(answers.unica_referencia||'-'));
        lines.push('• Prazo ideal: '+(answers.unica_prazo||'-'));
      }else{
        lines.push('• Tipo de operação: '+composeSingleWithOutro('rec_tipo_operacao',answers));
        lines.push('• Conteúdos por mês: '+(answers.rec_volume||'-'));
        lines.push('• Objetivo principal: '+composeSingleWithOutro('rec_objetivo',answers));
        lines.push('• Material gravado: '+(answers.rec_gravado||'-'));
        lines.push('• Prazo para começar: '+(answers.rec_inicio||'-'));
        lines.push('• Empresa / Marca: '+(answers.empresa||'-'));
      }
      lines.push('• Nome: '+(answers.nome||'-'));
      lines.push('• WhatsApp: '+formatPhone(answers.whatsapp||''));
      lines.push('• Instagram: '+(answers.instagram||'-'));
      lines.push('• Observações extras: '+(answers.extras||'-'));
      const text=lines.join('\n');
      window.open('https://wa.me/'+WA_NUMBER+'?text='+encodeURIComponent(text),'_blank');
    }
    function composeSingleWithOutro(baseId,source){const data=source||state.answers;const v=data[baseId]||'-';if(v!=='Outro') return v;const extra=sanitizeText(data[baseId+'_outro']||'',FIELD_LIMITS.outro);return extra?('Outro: '+extra):'Outro';}
    function getTextLimitForField(fieldId){
      if(fieldId==='nome') return FIELD_LIMITS.nome;
      if(fieldId==='instagram') return FIELD_LIMITS.instagram;
      if(fieldId==='empresa') return FIELD_LIMITS.empresa;
      return FIELD_LIMITS.outro;
    }
    function sanitizeText(value,maxLen){
      if(typeof value!=='string') return '';
      const normalized=value.normalize('NFKC').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim();
      const withoutTags=normalized.replace(/<[^>]*>/g,'');
      return withoutTags.slice(0,maxLen);
    }
    function containsHtml(value){return /<[^>]+>/.test(String(value||''));}
    function hasDangerousScheme(value){return /(javascript:|vbscript:|data:text\/html)/i.test(String(value||''));}
    function validateBrazilPhone(digits){
      if(!digits) return {ok:false,error:'Digite seu WhatsApp para continuar.'};
      if(digits.length<10||digits.length>11) return {ok:false,error:'Use um número brasileiro com DDD e 10 ou 11 dígitos.'};
      const ddd=digits.slice(0,2);
      if(!DDD_VALIDOS.has(ddd)) return {ok:false,error:'DDD inválido. Verifique o número e tente novamente.'};
      if(/^(\d)\1+$/.test(digits)) return {ok:false,error:'Número inválido. Digite um WhatsApp real.'};
      if(digits==='12345678910') return {ok:false,error:'Número inválido. Digite um WhatsApp real.'};
      if(isSequential(digits)) return {ok:false,error:'Número inválido. Digite um WhatsApp real.'};
      if(digits.length===11&&digits.charAt(2)!=='9') return {ok:false,error:'Para 11 dígitos, o número deve ser celular válido.'};
      return {ok:true};
    }
    function isSequential(value){const arr=value.split('').map((n)=>Number(n));let up=true;let down=true;for(let i=1;i<arr.length;i++){if(arr[i]!==arr[i-1]+1) up=false;if(arr[i]!==arr[i-1]-1) down=false;}return up||down;}
    function onlyDigits(value){return String(value||'').replace(/\D/g,'');}
    function formatPhone(value){const digits=onlyDigits(value).slice(0,11);if(!digits) return '';if(digits.length<=2) return '('+digits;if(digits.length<=6) return '('+digits.slice(0,2)+') '+digits.slice(2);if(digits.length<=10) return '('+digits.slice(0,2)+') '+digits.slice(2,6)+'-'+digits.slice(6);return '('+digits.slice(0,2)+') '+digits.slice(2,7)+'-'+digits.slice(7);}
    function ok(value,extra){return {ok:true,value,extra:extra||null}};
    function fail(error){return {ok:false,error}};
    function escapeHtml(str){return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    function escapeAttr(str){return escapeHtml(str);}
    function cssEscape(value){return String(value).replace(/([#.;?+*~':"!^$\[\]()=>|\\/@])/g,'\\$1');}
    function setTipo(tipo){
      state.tipo=(tipo==='recorrente')?'recorrente':'unica';
      state.currentIndex=0;
      state.readyToSubmit=false;
      state.answers={};
      state.startedAt=Date.now();
      state.isSubmitting=false;
      state.submitLockedUntil=0;
      state.lastSubmissionHash='';
      state.finalError='';
      render();
    }
    function clearWizard(){
      state.tipo='';
      state.currentIndex=0;
      state.readyToSubmit=false;
      state.answers={};
      state.finalError='';
      render();
    }
    window.HagavBudget={
      setTipo,
      clearWizard,
      rerender: render,
      getTipo: ()=>state.tipo
    };
    render();

