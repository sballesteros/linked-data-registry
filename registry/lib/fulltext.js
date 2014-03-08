var fulltext = exports;

fulltext.fullpackage = {
  index: function(doc) { 
    var ret=new Document(); 

    ret.add(doc.name); 

    if(doc.description){
      ret.add(doc.description);
    }

    if('keywords' in doc){
      doc.keywords.forEach(function(kw){
        ret.add(kw); 
      });
    }

    ['dataset', 'code', 'figure', 'article'].forEach(function(t){
      if (t in doc) {
        doc[t].forEach(function(r){
          if (r.description) {
            ret.add(r.description);         
          };
        });
      }
    });
    
    return ret;
  }
};
