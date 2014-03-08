var fulltext = exports;

fulltext.by_name = {
  index: function(doc) { 
    var ret=new Document(); 
    ret.add(doc.name); 
    ret.add(doc.description); 
    return ret 
  }
};
