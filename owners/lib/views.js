var views = exports;

views.maintainers = {
  map: function (doc) {
    doc.maintains.forEach(function (dpkg) {
      emit(dpkg, {name: doc.name, email: doc.email});
    });
  }, 
  reduce: "_count"
};
