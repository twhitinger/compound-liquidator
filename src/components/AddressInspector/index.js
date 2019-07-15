import React from 'react';

// import ReactTable from "react-table";
import BalanceTable from "../../components/BalanceTable/index.js"
import { BigNumber } from "bignumber.js";

import { useWeb3Context } from "web3-react/hooks";

import "./AddressInspector.css"

var app;
var accountLiquidity = 0;
var web3;

var maxRepayAmount = 0;
var tokenAddressToBeRepaid = "";

function GetIntendedRepayAmount() {
  var repaySlider = document.getElementById('repaySlider');
  return new BigNumber(repaySlider.value / repaySlider.max * maxRepayAmount).toFixed(4);
}

function OnRepaySliderValueChange() {
  // update the liquidation button text
  var repayAmount = GetIntendedRepayAmount();

  var liquidationButton = document.getElementById('LiquidateButton');

  liquidationButton.innerText = "Repay " + repayAmount + " " + app.state.asset_repay;

  // update the estimated collection amount text
  var assetCollateralAddress = null;

  var assetOgSymbol = "";
  var repayOgSymbol = "";

  // first determine which asset the user will be collecting
  app.state.TOKENS.forEach(t => {
    if (t.symbol === app.state.asset_collect) {
      assetCollateralAddress = t.address;
      assetOgSymbol = t.ogSymbol;
    }
    if (t.symbol === app.state.asset_repay) {
      repayOgSymbol = t.ogSymbol;
    }
  });

  var liduidationDetailsText = document.getElementById('LiquidationDetailsText');

  if ((assetCollateralAddress !== null) && (repayAmount > 0)) {
    // first take the repay amount and convert to eth
    var assetRepayExchangeRate = app.state.asset_prices[tokenAddressToBeRepaid];
    // factor in the liquidation discount amount
    var estimatedCollectionAmount = (repayAmount * assetRepayExchangeRate) * app.state.liquidationDiscount;
    console.log(estimatedCollectionAmount);
    if (assetOgSymbol !== "ETH") {
      estimatedCollectionAmount /= app.state.asset_prices['0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5'];
      console.log(estimatedCollectionAmount);
    }
    // then get the exchange rate for the collection asset
    var assetCollectExchangeRate = app.state.asset_prices[assetCollateralAddress];
    // and determine how much the user will receive in the collection asset

    // the exchange rate between the asset that we're repaying / collecting
    var repayForCollectExchangeRate = (assetCollectExchangeRate / assetRepayExchangeRate) * app.state.liquidation_discount;
    if (assetOgSymbol === "ETH") {
      repayForCollectExchangeRate /= Math.pow(10, 12);
    } else {
      repayForCollectExchangeRate *= Math.pow(10, 12);
    }

    liduidationDetailsText.innerText = "You will collect an (estimated) ~" + estimatedCollectionAmount + " " +
      assetOgSymbol + ". (Rate = " + repayForCollectExchangeRate + " " + repayOgSymbol + "/" +
      assetOgSymbol + ")";
  } else {
    liduidationDetailsText.innerText = ".";
  }
}

function OnRefreshClicked() {
  accountLiquidity = 0;
  tokenAddressToBeRepaid = "";

  document.getElementById('repaySlider').value = 50;

  document.getElementById('LiquidateButton').innerText = "Repay";

  document.getElementById('LiquidationDetailsText').innerText = ".";

  app.setState({
    borrow_balances : {},
    supply_balances : {},

    pending_balances: {}, // what we're currently fetching

    asset_repay: "",
    asset_collect: "",

    repaySubmittedTxHash : "",

    liquidateBlocked : true
  });
}

function OnBackClicked() {
  accountLiquidity = 0;
  tokenAddressToBeRepaid = "";

  app.setState({
    inspected_address: "",

    borrow_balances: {},
    supply_balances: {},

    pending_balances: {}, // what we're currently fetching

    asset_repay: "",
    asset_collect: "",

    repaySubmittedTxHash : "",

    liquidateBlocked : true
  });
}

function OnCopyAddressClicked() {
  // build the URL we want to copy
  var url = "https://conlan.github.io/compound-liquidator?address=" + app.state.inspected_address;

  // hack to copy text to clipboard
  const el = document.createElement('textarea');
  el.value = url;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);

  // tell the user what happened
  window.alert("\"" + url + "\" copied to clipboard.");
}

function InitiateLiquidate() {
  var requestAmountClose = GetIntendedRepayAmount();

  if (Number(requestAmountClose) === 0) {
    window.alert("Please set an amount greater than 0.");
  } else {
    var myAccount = web3.account;
    var targetAccount = app.state.inspected_address;

    // determine the asset borrow and collateral
    var assetBorrowAddress = "";
    var assetBorrowAbi = "";
    var assetBorrowDecimals = 0;

    var assetCollateralAddress = "";
    var assetCollateralAbi = "";

    app.state.TOKENS.forEach(t => {
      if (t.symbol === app.state.asset_collect) {
        assetCollateralAddress = t.address; // the asset we're collecting is the one that the target collateralized
        assetCollateralAbi = t.abi;
      }

      if (t.symbol === app.state.asset_repay) {
        assetBorrowAddress = t.address; // the asset that the target borrowed is the one that we are repaying on behalf of them
        assetBorrowAbi = t.abi;

        assetBorrowDecimals = Math.pow(10, t.decimals);
      }
    });


    requestAmountClose = new BigNumber(requestAmountClose * assetBorrowDecimals).toFixed();
    var tokenContract = new web3.web3js.eth.Contract(assetBorrowAbi, assetBorrowAddress);

    // cETH address uses different liquidate function
    if (assetBorrowAddress === "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5") {
      tokenContract.methods.liquidateBorrow(targetAccount, assetCollateralAddress).send(
      {
        from: myAccount,
        value: web3.toWei(requestAmountClose, "ether")
      }).on('transactionHash', (txHash) => {
        // clear out the estimated collection liquidation details
        document.getElementById('LiquidationDetailsText').innerText = ".";

        app.setState({
          asset_repay: "",
          asset_collect: "",

          repaySubmittedTxHash : txHash
        });// TODO await confirmation
      }).on("confirmation", (err, receipt) => {
        if (app.state.repaySubmittedTxHash === receipt.transactionHash) {
          OnRefreshClicked();
        }
    })
    } else {
      console.log(requestAmountClose);
      tokenContract.methods.liquidateBorrow(targetAccount, requestAmountClose, assetCollateralAddress).send(
        { from: myAccount }
      ).on('transactionHash', (txHash) => {
        // clear out the estimated collection liquidation details
        document.getElementById('LiquidationDetailsText').innerText = ".";

        app.setState({
          asset_repay: "",
          asset_collect: "",

          repaySubmittedTxHash : txHash
        });// TODO await confirmation
      }).on("confirmation", (err, receipt) => {
        if (app.state.repaySubmittedTxHash === receipt.transactionHash) {
          OnRefreshClicked();
        }
    });
  }
}
}

function GetInspectedAccount() {
	var inspected_account = null;

    app.state.accounts.forEach(account => {
    	if (account.address.toLowerCase() == app.state.inspected_address.toLowerCase()) {
    		inspected_account = account;
    	}
   	});

   	return inspected_account;
}

function AddressInspector (props) {
    app = props.app;

    web3 = useWeb3Context();

    if (accountLiquidity === 0) {
      var compoundContract = new web3.web3js.eth.Contract(app.state.COMPTROLLER_ABI, app.state.COMPTROLLER_ADDRESS);

      // only if we're not fetching a pending balance
      if (Object.keys(app.state.pending_balances).length === 0) {
        compoundContract.methods.getAccountLiquidity(app.state.inspected_address).call(function(error, result) {
          if (error == null) {
              if (Number(result[1]) <= 0) {
                accountLiquidity = new BigNumber(result[2] / 1e18);

                app.setState({
                  liquidateBlocked : false
                });

                // reset the repay slider to min
                var repaySlider = document.getElementById('repaySlider');
                repaySlider.value = repaySlider.min;
              }
            } else {
              console.log(error);
            }
        });
      }
    }

    // refresh not disabled by default
    var refreshDisabled = false;

    // but check that we have all the borrow balances fetched
    if ((Object.keys(app.state.borrow_balances).length) < Object.keys(app.state.TOKENS).length) {
      refreshDisabled = true;
    } else if ((Object.keys(app.state.supply_balances).length) < Object.keys(app.state.TOKENS).length) {
      // and all the supply balances fetched. If either of these aren't fully fetched then disable refresh
      refreshDisabled = true;
    }

    var canLiquidate = false;

    var liquidationText = ".";

    var transactionSubmittedText = "";
    var transationSubmittedLink = "";
    var transactionSpinnerVisibility = 'hidden';

    var repaySliderDisabled = true;

    // only enable liquidate button if both asset to repay and collect have been set
    if ((app.state.asset_repay.length > 0) && (app.state.asset_collect.length > 0)) {
      if (app.state.asset_repay !== app.state.asset_collect) {
        canLiquidate = true;

        repaySliderDisabled = false;

        // find the address for the token that the user has selected to repay
        app.state.TOKENS.forEach(t => {
          if (t.symbol === app.state.asset_repay) {
            tokenAddressToBeRepaid = t.address;
          }
        });

        // calculate the maximum amount that the user can liquidate
        // we can actually liquidate more than just their account liquidity since after seizing assets from their supply, the account's ratio will go under 1.5x and so forth.
        // this determines the maximum amount that we can seize in 1 liquidation
        maxRepayAmount = app.state.borrow_balances[tokenAddressToBeRepaid] * app.state.close_factor;
      } else {
        liquidationText = "Unable to repay " + app.state.asset_repay + " and collect same asset " + app.state.asset_collect + ".";
      }
    }

    if (app.state.repaySubmittedTxHash.length > 0) {
      transactionSubmittedText = "Repay submitted! View your tx: "
      transationSubmittedLink = app.state.ETHERSCAN_PREFIX + "tx/" + app.state.repaySubmittedTxHash;

      // show the spinner
      transactionSpinnerVisibility = 'visible';
    }

    var liquidationDiscountDisplay = "";
    if (app.state.liquidationDiscount < 0) {
      liquidationDiscountDisplay = "-";
    } else {
      liquidationDiscountDisplay = (app.state.liquidationDiscount * 100);
    }

    var accountLiquidityDisplay = "";
    if (accountLiquidity !== 0) {
      accountLiquidityDisplay = accountLiquidity + " ETH";
    } else {
      // if account liquidity not set then disable refresh
      refreshDisabled = true;
    }

    var stateColor = (app.state.inspected_address_state === 'risky') ? '#ffbf00' :
      (app.state.inspected_address_state === 'safe') ? '#57d500' : '#ff2e00';

    var stateText = app.state.inspected_address_state;

    return (
      <div className="AddressInspector">
        <div>
          <p className="SameLine"><b>Address:</b> <i>{app.state.inspected_address} </i></p>
          <button onClick={() => OnCopyAddressClicked()}><img className="CopyButton" alt="copy" src="./copy.png"/></button>

          <button className="RefreshButton" onClick={() => OnRefreshClicked()} disabled={refreshDisabled}>Refresh</button>
        </div>
        <p><b>Account Liquidity:</b> {accountLiquidityDisplay}</p>
        <span><p><b>State: </b><span style={{color:stateColor}}>&#x25cf;</span> {stateText}</p></span>

        <p>Choose an asset to collect at {liquidationDiscountDisplay-100}% discount:</p>
        <BalanceTable app={app} balanceType="Supplied" stateProperty="asset_collect"/>

        <p>Choose a different asset to repay on behalf of borrower to return their <b>Account Liquidity</b> to 0:</p>

        <BalanceTable app={app} balanceType="Borrowed" stateProperty="asset_repay"/>
        <br/>

        <div className="ButtonDiv">
          <button className="BackButton" onClick={() => OnBackClicked()}>Back</button>

          <button className="LiquidateButton" disabled={!canLiquidate} id="LiquidateButton"
            onClick={() => InitiateLiquidate()}
          >Repay</button>

          <input type="range" onInput={() => OnRepaySliderValueChange()} min={0} max={100}
            className="slider" id="repaySlider" disabled={repaySliderDisabled}/>

        </div>

        <p className="LiquidationDetails" id="LiquidationDetailsText">{liquidationText}</p>

        <div className="TransactionPendingDiv">
          <p className="TransactionSubmissionDetails">{transactionSubmittedText}<a href={transationSubmittedLink}
              rel="noopener noreferrer" target="_blank">{transationSubmittedLink}</a> <img style={{visibility:transactionSpinnerVisibility}} alt="loading" src="./small-loading.gif"/></p>
        </div>
      </div>

    )
  }

  export default AddressInspector;
