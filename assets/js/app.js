var _, schema, Handlebars, Backbone, mediaWidgets, exporters, importers;

var viewSchema;
//Make it correspond to a directory stucture so images can be saved to folders.
var DeckModel = Backbone.Model.extend({
  addCard : function(){
    this.get('cards').push({});
  },
  toSmallJSON : function(){
    var json = this.toJSON();
    return _.extend({}, json, {
      cards : _.map(json.cards, function(card) {
        return _.extend(_.omit(card, ['idx', 'isCurrent']), {
          image : _.omit(card.image, 'dataURL'),
          audio : _.omit(card.audio, 'dataURL')
        });
      })
    });
  }
});
var deck = new DeckModel({
  cards : [],
  name : "slide-show"
});
deck.addCard();

var currentCard = deck.get('cards')[0];

var initializeUI = function () {

var cardStubTemplate = Handlebars.compile($('#card-stub-template').html());

var renderCurrentCard = function(){
  if(!currentCard) {
    $('.card-container').hide();
  } else {
    $('.card-container').show();
    _.invoke(viewSchema, 'render');
  }
  renderDeck();
};
var renderDeck = function(){
  _.each(deck.get('cards'), function(card, idx){
    card.idx = idx;
    card.isCurrent = (currentCard === card);
  });
  $('.cards').html(deck.get('cards').map(cardStubTemplate).join(''));
  
  _.defer(function(){
    if(deck.deckSortable) return;//window.deckSortable.destroy();
    var $container = $(".sortable");
    deck.deckSortable = new Sortable($container.get(0), {
      draggable: ".card-label",
      ghostClass: "invisible",
      handle: ".label-handle",
      onUpdate: function (evt/**Event*/){
        var newCardArray = [];
        $container.children().each(function(idx, el){
          console.log(el);
          var parsedNidx = parseInt(el.id, 10);
          newCardArray[idx] = deck.get('cards')[parsedNidx];
        });
        deck.set('cards', newCardArray);
        // causing sortable bug where double click to drag causes cloning?
        renderDeck();
      }
    });
  });
};

if("localStorage" in window) {
  if(localStorage.getItem("downloadWavConverter") === "true") {
    window.wavConverterLoading = true;
    worker = createWebWorker();
    worker.onready = function(event) {
      window.wavConverterLoaded = true;
      renderCurrentCard();
    };
  }
}

viewSchema = _.map(schema, function(widget, idx){
  var currentView;
  var templateString = $("#" + widget.type + "-template").html();
  if(!templateString) {
    console.log("missing template");
    alert("Missing template");
  }
  
  var WidgetView = Backbone.View.extend({
    template : Handlebars.compile(templateString),
    basicRender : function(){
      this.$el.html(this.template({
        name : this.name,
        value : this.value.get(),
        wavConverterLoading : window.wavConverterLoading,
        wavConverterLoaded : window.wavConverterLoaded
      }));
      return this;
    },
    render : function(){
      return this.basicRender();
    },
    value : {
      get : function(){
        return currentCard[widget.name];
      },
      set : function(value){
        currentCard[widget.name] = value;
        if(widget.name === 'text') {
          renderDeck();
        }
      }
    }
  }).extend(mediaWidgets[widget.type]).extend(widget);
  
  var $el = $('<div id="' + widget.name + '"></div>');
  $el.addClass('widget widget-' + (idx % 3) + ' ' + widget.type);
  $('.output').append($el);
  currentView = new WidgetView({
    el: $el
  });
  return currentView;
});
renderCurrentCard();

//Deck handlers
$( document ).on("click", ".card-label", function( event, ui ) {
  var cardIdx = parseInt($(event.currentTarget).prop('id'), 10);
  currentCard = deck.get('cards')[cardIdx];
  console.assert(currentCard);
  $('textarea').blur();
  $('.card').addClass('card-animation');
  window.setTimeout(function(){
    window.setTimeout( function(){
      $('.card').removeClass('card-animation');
    }, 1000 );
    renderCurrentCard();
    $('.deck').addClass("no-show");
  }, 100);
});
$(document).on('click', '.add-card', function(evt) {
  deck.addCard();
  renderDeck();
});
$(document).on('click', '.rm-card', function(evt) {
  var currentCardIdx = currentCard.idx;
  var cards = deck.get('cards');
  var newCards = cards.filter(function(card, idx){
    return (idx !== currentCardIdx);
  });
  deck.set('cards', newCards);
  currentCard = newCards[(currentCardIdx % newCards.length)];
  renderDeck();
  renderCurrentCard();
});
$(document).on('change keypress', '#ss-title-input', function(evt) {
  deck.set('name', $(evt.currentTarget).val());
});
deck.on('change:name', function(){
  $('#ss-title-input').val(deck.get('name'));
});
deck.trigger('change:name');

$(document).on('click', '.toggle-panel', function(evt) {
  $('.deck').toggleClass("no-show");
});

$(document).on('click', '.export-github', function(evt) {
  $('#exportModal').modal('hide');
  $('#outputModal').modal({show:true});
  $('#output').text("Publishing to github...");
  exporters.github(deck, function(err, pubURL){
    if(err) {
      $('#output').html("<p>The presentation could not be published.</p>");
      console.log(err);
      return;
    }
    var $openBtn = $('<a class="btn btn-success">Open Presentation<a>');
    $openBtn.attr('href', pubURL)
        .attr("target", "_blank");
    $('#output').empty()
      .append("<p>It may take a few minutes before your presentation is updated on github.</p>")
      .append($openBtn);
  });
});
$(document).on('click', '.export-zip', function(evt) {
  $('#download').text('generating zip...');
  $('#exportModal').modal('hide');
  $('#outputModal').modal({show:true});
  $('#output').text("Creating zip...");
  exporters.zip(deck, function(err, zipBlob){
    var $downloadBtn = $('<a class="btn btn-primary">Download<a>');
    $downloadBtn.attr('href', window.URL.createObjectURL(zipBlob));
    $downloadBtn.attr('download', "presentation.zip");
    $('#output').empty().append($downloadBtn);
  });
});
$(document).on('change', '.uploadzip', function(evt) {
  $('.uploadzip-status').empty();
  var files = evt.target.files;
  importers.zip(files[0], function(err, deckJSON){
    if(err) {
      console.log(err);
      return;
    }
    deck.set('cards', deckJSON.cards);
    deck.set('name', deckJSON.name);
    $('.uploadzip-status').text("Imported!");
    renderCurrentCard();
    //Clear the file input so the form can be updated:
  });
  $('.uploadzip').val("");
  $('.uploadzip-status').text("importing...");
});
$(document).one('click', '.help', function(evt) {
  //TODO: Remove when closed for 60 seconds to conserve memory
  $('.help-body').html('<iframe src="tutorial/index.html" seamless="seamless" style="width:100%;height:340px"></iframe>');
});

$('.loading').remove();

};