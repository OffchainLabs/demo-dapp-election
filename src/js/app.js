App = {
  web3Provider: null,
  contracts: {},
  account: '0x0',
  hasVoted: false,

  init: function() {
    return App.initWeb3();
  },

  initWeb3: async function() {
    var standardWeb3 = null;
    if (window.ethereum) {
        standardWeb3 = new Web3(ethereum);
        try {
            // Request account access if needed
            await ethereum.enable();
        } catch (error) {
          console.log("User denied account access")
        }
    } else if (window.web3) {
        // Legacy dapp browsers...
        standardWeb3 = new Web3(web3.currentProvider);
    }
    // Non-dapp browsers...
    else {
        console.log('Non-Ethereum browser detected. You should consider trying MetaMask!');
    }
    const contracts_promise = new Promise(function(resolve, reject) {
      $.getJSON('compiled.json', function(data) {
        resolve(data)
      })
      .fail(function (jqhr, textStatus, error) {
        reject("Failed to load compiled.json. " + textStatus + ": " + error)
      });
    });
    const contracts = await contracts_promise;

    let arbProvider = new ArbProvider(
      'http://localhost:1235',
      contracts,
      standardWeb3.currentProvider
    );
    App.web3Provider = arbProvider;
    web3 = new Web3(arbProvider)
    return App.initContract();
  },

  initContract: function() {
    $.getJSON("Election.json", function(election) {
      // Instantiate a new truffle contract from the artifact
      App.contracts.Election = TruffleContract(election);
      // Connect provider to interact with contract
      App.contracts.Election.setProvider(App.web3Provider);

      App.listenForEvents();

      return App.render();
    });
  },

  // Listen for events emitted from the contract
  listenForEvents: function() {
    App.contracts.Election.deployed().then(function(instance) {
      // Restart Chrome if you are unable to receive this event
      // This is a known issue with Metamask
      // https://github.com/MetaMask/metamask-extension/issues/2393
      instance.votedEvent({}, {
        fromBlock: 0,
        toBlock: 'latest'
      }).watch(function(error, event) {
        console.log("event triggered", event)
        // Reload when a new vote is recorded
        App.render();
      });
    });

    var accountInterval = setInterval(function() {
      web3.eth.getAccounts(function(err, accounts) {
        if (err === null && accounts[0] != App.account) {
          console.log("Updated account", accounts[0])
          App.account = accounts[0];
          App.render();
        }
      });
    }, 100);
  },

  render: function() {
    var electionInstance;
    var loader = $("#loader");
    var content = $("#content");

    loader.show();
    content.hide();

    web3.eth.getAccounts(function(err, accounts) {
      console.log(err, accounts)
    })

    $("#accountAddress").html("Your Account: " + App.account);

    // Load contract data
    App.contracts.Election.deployed().then(function(instance) {
      electionInstance = instance;
      return electionInstance.candidatesCount();
    }).then(function(candidatesCount) {
      console.log("Count is", candidatesCount.toString())
      
      var candidateFutures = [];
      for (var i = web3.toBigNumber(1); i.lte(candidatesCount); i = i.add(1)) {
        candidateFutures.push(electionInstance.candidates(i))
      }
      Promise.all(candidateFutures).then(candidates => {
        var candidatesResults = $("#candidatesResults");
        candidatesResults.empty();

        var candidatesSelect = $('#candidatesSelect');
        candidatesSelect.empty();
        for (var i = 0; i < candidates.length; i++) {
          var candidate = candidates[i];
          console.log("Candidate", i, "is", candidate)
          var id = candidate[0];
          var name = candidate[1];
          var voteCount = candidate[2];

          // Render candidate Result
          var candidateTemplate = "<tr><th>" + id + "</th><td>" + name + "</td><td>" + voteCount + "</td></tr>"
          candidatesResults.append(candidateTemplate);

          // Render candidate ballot option
          var candidateOption = "<option value='" + id + "' >" + name + "</ option>"
          candidatesSelect.append(candidateOption);
        }
      })
      return electionInstance.voters(App.account);
    }).then(function(hasVoted) {
      console.log("hasVoted is", hasVoted)
      // Do not allow a user to vote
      if(hasVoted) {
        $('form').hide();
      }
      loader.hide();
      content.show();
    }).catch(function(error) {
      console.warn(error);
    });
  },

  castVote: function() {
    var candidateId = $('#candidatesSelect').val();
    App.contracts.Election.deployed().then(function(instance) {
      return instance.vote(candidateId, { from: App.account });
    }).then(function(result) {
      // Wait for votes to update
      $("#content").hide();
      $("#loader").show();
    }).catch(function(err) {
      console.error(err);
    });
  }
};

$(function() {
  $(window).load(function() {
    App.init();
  });
});
