import React, { Component } from "react";

import AccountsTable from "./components/AccountsTable/index.js";
import AddressInspector from "./components/AddressInspector/index.js";

import Compound from "./constants/Compound.js"
import CompoundStaging from "./constants/CompoundStaging.js"

import axios from "axios";

import { useWeb3Context } from "web3-react/hooks";

import "./App.css";

// import sampleJson from "./samplejson.json";

let web3 = null;

function Web3Setter(props) {
  if (web3 === null) {
    var app = props.app;

    web3 = useWeb3Context();

    if (web3.networkId === app.state.MAIN_NETWORK_ID) {

      app.state.ORACLE_ADDRESS = Compound.oracleAddress;
      app.state.ORACLE_ABI = Compound.oracleAbi;

      app.state.COMPTROLLER_ABI = Compound.comptrollerAbi;
      app.state.COMPTROLLER_ADDRESS = Compound.comptrollerAddress;

      app.state.TOKENS = Compound.tokens;

      app.state.LIQUIDATION_ADDRESS = Compound.liquidationAddress;
      app.state.LIQUIDATION_ABI = Compound.liquidationABI;

      app.state.ETHERSCAN_PREFIX = "https://etherscan.io/";

      app.state.MIN_COLLATERAL_RATIO = Compound.minCollateralRatio;
      app.state.SAFE_COLLATERAL_RATIO = Compound.safeCollateralRatio;
    } else if (web3.networkId === app.state.STAGING_NETWORK_ID) {
      app.state.TOKENS = CompoundStaging.tokens;

      app.state.LIQUIDATION_ADDRESS = CompoundStaging.liquidationAddress;
      app.state.LIQUIDATION_ABI = CompoundStaging.liquidationABI;

      app.state.ETHERSCAN_PREFIX = "https://rinkeby.etherscan.io/";

      app.state.MIN_COLLATERAL_RATIO = CompoundStaging.minCollateralRatio;
      app.state.SAFE_COLLATERAL_RATIO = CompoundStaging.safeCollateralRatio;
    }

    app.refreshAccountList();
    app.refreshAllowanceStates();
  }

  return (<div/>)
}

/*
 * Parse response data from server into an array of account objects. Can point to local json or server response
 */
function ParseAccountDataResponse(json, app) {
  var newAccounts = [];

  json.accounts.forEach(accountData => {
    var account = {
      address: accountData.address,

      // how much the borrower has borrowed in ETH
      totalEthBorrow: accountData.total_borrow_value_in_eth.value,

      account_tokens: accountData.tokens,

      // how much the borrower has supplied in ETH
      totalEthSupply: accountData.total_collateral_value_in_eth.value,

      health: accountData.health.value,

      close_factor: accountData.close_factor,

      liquidation_incentive: accountData.liquidation_incentive,

      // when this borrower was last updated (ETH block)
      blockUpdated: accountData.block_updated
    };

    newAccounts.push(account);
  });

  var inspectedAddressParam = "";
  try {
    // check for URL Search Params support
    if ("URLSearchParams" in window) {
      // extract factory token from URL if found
      var urlParams = new URLSearchParams(window.location.search);

      if (urlParams.has("address")) {
        var addressInput = urlParams.get("address");

        // validate the address input before assuming it's a valid address
        if (web3.web3js.utils.isAddress(addressInput)) {
          inspectedAddressParam = addressInput;
        }
      }
    }
  } catch (e) {
    console.log(e);
  }

  var discount = json.liquidation_incentive;
  var close_factor = json.close_factor;

  app.setState({
    accounts: newAccounts,
    inspected_address : inspectedAddressParam,
    liquidationDiscount: discount,
    close_factor: close_factor
  });
}

class App extends Component {
  constructor() {
    super();

    this.state = {
      accounts: [],

      // the address we're currently inspecting
      inspected_address: "",
      // the state of that address (risky, safe, unsafe) TODO this should be wrapped in a single address object
      inspected_address_state : "",

      // used when inspecting an address to hold how much the account has borrowed or supplied
      borrow_balances: {},
      supply_balances: {},
      // which balances are currently being requested from server
      pending_balances: {},

      pending_allowances: {},
      allowance_states: {},

      asset_prices: {},

      // the asset that the user has toggled to repay for the borrow
      asset_repay: "",
      // the asset that the user has toggled to collect from borrower
      asset_collect: "",

      // holds the submitted liquidation transation hash
      repaySubmittedTxHash : "",

      // the discount for liquidating borrows (gets fetched later)
      liquidationDiscount : -1,

      // whether the user can choose assets on the address inspect. Blocked by default unless that account has a negative account liquidity
      liquidateBlocked : true,

      currentBlock : "",

      // CONSTANTS
      MAIN_NETWORK_ID : 1,
      STAGING_NETWORK_ID : 4,

      MONEY_MARKET_ADDRESS : "",
      MONEY_MARKET_ABI : "",

      TOKENS : [],

      LIQUIDATION_ADDRESS : "",
      LIQUIDATION_ABI : "",

      ETHERSCAN_PREFIX : "",

      MIN_COLLATERAL_RATIO : 0,
      SAFE_COLLATERAL_RATIO : 0
    };
  }

  componentDidMount() {}

  render() {
  	// if we're inspecting an address
    if (this.state.inspected_address.length > 0) {
      return (
        <AddressInspector app={this} />
      );
    } else {
   	  // else we're not inspecting an address, check if there's any accounts. if not then show loading gif
      if (this.state.accounts.length === 0) {
        return (
          <div>
            <Web3Setter app={this}/>
            <img alt="Loading" src="./loading.gif" className="Loading" />
          </div>
        );
      } else {
      	// show the accounts list
        return (
          <AccountsTable accounts={this.state.accounts} app={this} currentBlock={this.state.currentBlock}/>
        );
      }
    }
  }

  refreshAllowanceStates() {
    // find out how much the liquidation address can spend on user's behalf. If 0 then the token is not "enabled" for liquidation
    let that = this;

    this.state.TOKENS.forEach((t) => {
      if ((t.address in this.state.allowance_states) === false) {

        var tokenContract = new web3.web3js.eth.Contract(t.abi, t.address);
        tokenContract.methods.allowance(web3.account, this.state.LIQUIDATION_ADDRESS).call(function(error, allowance) {
          if (error === null) {
            if (allowance > 0) {
              that.state.allowance_states[t.address] = true;

              that.setState({});
            }
          }
        });
      }

      if ((t.address in this.state.asset_prices) === false) {
        var tokenDecimals = Math.pow(10, t.decimals);
        var oracleContract = new web3.web3js.eth.Contract(this.state.ORACLE_ABI, this.state.ORACLE_ADDRESS);
        oracleContract.methods.getPrice(t.regularAddress).call(function(error, price) {
          if (error === null) {
            price = price / tokenDecimals;
            that.state.asset_prices[t.address] = price;
          }
        });
      }
    });
  }

  refreshAccountList() {
  	// TESTING
    // ParseAccountDataResponse(sampleJson, this);
    var URL = null;

    if (web3.networkId === this.state.MAIN_NETWORK_ID) {
      // mainnet
      URL = "https://api.compound.finance/api/v2/account";
    } else if (web3.networkId === this.state.STAGING_NETWORK_ID) {
      // Staging
      URL = "https://api.stage.compound.finance/api/risk/v1/get_account_values";
    }

    axios({
      method: "POST",
      url: URL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
        // ,'compound-api-key' : 'xxx' TODO implement this when CORS response headers are fixed
      },
      // TODO put input fields on main page for user to set
      data: {
        page_size: 100,
        min_borrow_value_in_eth: {
          value: ".002"
        },
        max_health: { "value": "2.0" },
        block_number: 0
      }
    }).then(response => {
        ParseAccountDataResponse(response.data, this);
      })
      .catch(error => {
        console.error(error);
      });
  }
}

export default App;
