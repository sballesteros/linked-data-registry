var indexes = exports;

indexes.fullpackage = {
  index: function(doc) {

    var terms = [];

    terms.push(doc.name);

    if(doc.description){
      terms.push(doc.description);
    }

    if('keywords' in doc){
      doc.keywords.forEach(function(kw){
        terms.push(kw);
      });
    }

    index('pkg', terms.join(' '), {store: 'no'});

    ['dataset', 'sourceCode', 'image', 'article'].forEach(function(t){
      if (t in doc) {
        var rterms = [];
        doc[t].forEach(function(r){
          if (r.description) {
            rterms.push(r.description);
            terms.push(r.description);
          }
        });
        if(rterms.length){
          index(t, rterms.join(' '), {store: 'no'});
        }
      }
    });

    index('default', terms.join(' '), {store: 'no'});

  }
};
