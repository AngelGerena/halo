// Pricing toggle: per-event <-> subscription
(function(){
  var tabs = document.querySelectorAll('.toggle-btn');
  var groups = document.querySelectorAll('[data-plan-group]');
  function show(plan){
    tabs.forEach(function(t){
      var on = t.getAttribute('data-plan') === plan;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    groups.forEach(function(g){
      g.classList.toggle('hidden', g.getAttribute('data-plan-group') !== plan);
    });
  }
  tabs.forEach(function(t){
    t.addEventListener('click', function(){ show(t.getAttribute('data-plan')); });
  });
})();

/* ============ EARLY ACCESS SIGNUP ============ */
(function(){
  var form = document.getElementById('signupForm');
  if(!form) return;
  var btn  = document.getElementById('signupBtn');
  var err  = document.getElementById('signupErr');
  var done = document.getElementById('signupDone');

  function showErr(msg){ err.textContent = msg; err.hidden = false; }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    err.hidden = true;
    var data = {
      church:    form.church.value.trim(),
      name:      form.name.value.trim(),
      email:     form.email.value.trim(),
      size:      form.size.value.trim(),
      eventType: form.eventType.value.trim(),
      budget:    form.budget.value.trim()
    };
    if(!data.email && !data.name){ showErr('Please include a name or email so we can reach you.'); return; }
    if(data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)){ showErr('That email doesn’t look right — mind double-checking it?'); return; }

    btn.disabled = true;
    var label = btn.textContent; btn.textContent = 'Sending…';

    fetch('/.netlify/functions/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r){
      if(!r.ok) throw new Error('bad status');
      form.hidden = true;
      done.hidden = false;
      done.scrollIntoView({ behavior:'smooth', block:'center' });
    }).catch(function(){
      btn.disabled = false; btn.textContent = label;
      showErr('Something went wrong on our end. Please try again, or email finessemediapro@gmail.com.');
    });
  });
})();
