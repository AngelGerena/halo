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

/* The old early-access "waitlist" signup form (which posted to the
   request-access function and emailed a "we'll reach out" reply) has been
   retired. The landing page now sends visitors straight to the real self-serve
   signup at /signup, where they create an account and build events themselves.
   The request-access function is kept in the repo in case the waitlist is ever
   wanted again, but nothing on the public page calls it. */
