import React from "react";

import ReactTable from "react-table";
import AccountsTableHeader from "../AccountsTableHeader/AccountsTableHeader.js"

import "react-table/react-table.css";

import "./AccountsTable.css";

import { useWeb3Context } from "web3-react/hooks";

var web3;
let app;

function InspectAddress(address, state) {
  app.setState({
    inspected_address: address,
    inspected_address_state: state
  });
}

function liquidate(address, state, supplied, borrowed) {
  console.log(app);
  var maxRepayAmountInEth = ((app.state.MIN_COLLATERAL_RATIO * borrowed) - supplied) / (app.state.MIN_COLLATERAL_RATIO - app.state.liquidationDiscount - 1);
  maxRepayAmountInEth /= 1e18;
  console.log(maxRepayAmountInEth);

  var comptrollerContract = new web3.web3js.eth.Contract(app.state.COMPTROLLER_ABI, app.state.COMPTROLLER_ADDRESS);

  var cETHContract = new web3.web3js.eth.Contract(app.state.COMPTROLLER_ABI, app.state.COMPTROLLER_ADDRESS);

  console.log(comptrollerContract);

  comptrollerContract.methods.getAccountLiquidity(address).call(function(err, res) {
    console.log(res);
  });
}

function AccountsTable(props) {
  app = props.app;

  web3 = useWeb3Context();
  const data = [];

  console.log(props.accounts);

  props.accounts.forEach(account => {
    var supplyAmount = (account.totalEthSupply / 1).toFixed(6);
    var borrowAmount = (account.totalEthBorrow / 1).toFixed(6);


    var state = "";
    var health = account.health;
    if (health < 1) {
      state = "unsafe";
    } else if (health <= 1.05) {
      state = "risky";
    } else {
      state = "safe";
    }

    var accountObj = {
      address: account.address,
      supply: Number(supplyAmount),
      borrow: Number(borrowAmount),
      health: account.health,
      state: state,
      block: Number(account.blockUpdated)
    };
    data.push(accountObj);
  });

  var etherScanPrefix = app.state.ETHERSCAN_PREFIX;

  const columns = [
    {
      Header: "Address",
      accessor: "address",
      maxWidth: 500,
      Cell: row => (
        <a href={etherScanPrefix + "address/" + row.value} target="_blank" rel="noopener noreferrer">
          {row.value}
        </a>
      )
    },
    {
      Header: "Last Updated",
      accessor: "block",
      maxWidth: 200,
      className: "right",
      Cell: row => (
        <a href={etherScanPrefix + "block/" + row.value} target="_blank" rel="noopener noreferrer">
          {row.value}
        </a>
      )
    },
    {
      Header: "Supply",
      accessor: "supply",
      maxWidth: 150,
      className: "right"
    },
    {
      Header: "Borrow",
      accessor: "borrow",
      maxWidth: 150,
      className: "right"
    },
    {
      Header: "Health",
      accessor: "health",
      maxWidth: 150,
      className: "right"
    },
    {
      Header: "State",
      accessor: "state",
      maxWidth: 200,
      Cell: row => (
        <span>
          <span
            style={{
              color:
                row.value === "safe"
                  ? "#57d500"
                  : row.value === "risky"
                  ? "#ffbf00"
                  : "#ff2e00",

              transition: "all .3s ease"
            }}
          >
            &#x25cf;
          </span>{" "}
          {row.value === "safe"
            ? "Safe"
            : row.value === "risky"
            ? "Risky"
            : "Unsafe"}
        </span>
      )
    },
    {
      Header: "Liquidate",
      accessor: "liquidate",
      maxWidth: 200,
      Cell: row => (
        <button
          className="liquidate-button"
          onClick={() => liquidate(row.row.address, row.original.state, row.row.supply, row.row.borrow)}
          disabled={false}
        >
          Liquidate
        </button>
      )
    }
  ];

  var showPageSizeOptions = false;
  var defaultPageSize = 15;

  // var minRows = defaultPageSize;

  return (
    <div className="AccountsTable">
      <AccountsTableHeader currentBlock={props.currentBlock} app={app}/>
      <br/>

      <ReactTable
        data={data}
        columns={columns}
        defaultPageSize={defaultPageSize}
        showPageSizeOptions={showPageSizeOptions}
        className="-striped"
      />
      <p>
        <a href="https://github.com/conlan/compound-liquidator" target="_blank" rel="noopener noreferrer">
          Github
        </a>{" "}
        |{" "}
        <a href="https://compound.finance" target="_blank" rel="noopener noreferrer">
          Compound
        </a>{" "}
        |{" "}
        <a href="https://compound.finance/developers#liquidate" target="_blank" rel="noopener noreferrer">
          Documentation
        </a>{" "}
        | Use at your own{" "}
        <b>
          <font color="red">risk!</font>
        </b>
      </p>
    </div>
  );
}

export default AccountsTable;
