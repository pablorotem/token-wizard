import React from "react";
import "../../assets/stylesheets/application.css";
import { Link } from "react-router-dom";
import { setExistingContractParams, getNetworkVersion, getNetWorkNameById } from "../../utils/blockchainHelpers";
import { gweiToWei, weiToGwei } from "../../utils/utils";
import { StepNavigation } from "../Common/StepNavigation";
import { RadioInputField } from "../Common/RadioInputField";
import { CrowdsaleBlock } from "./CrowdsaleBlock";
import {
  NAVIGATION_STEPS,
  VALIDATION_MESSAGES,
  VALIDATION_TYPES,
  TEXT_FIELDS,
  CHAINS,
  defaultTier,
  defaultTierValidations
} from '../../utils/constants'
import { inject, observer } from "mobx-react";
import { Loader } from '../Common/Loader'
import { noGasPriceAvailable, warningOnMainnetAlert } from '../../utils/alerts'
import { NumericInput } from '../Common/NumericInput'
import update from 'immutability-helper'
import { AddressInput } from '../Common/AddressInput'

const { CROWDSALE_SETUP } = NAVIGATION_STEPS;
const { VALID, INVALID } = VALIDATION_TYPES;
const { MINCAP, WALLET_ADDRESS, ENABLE_WHITELISTING } = TEXT_FIELDS;

@inject(
  "contractStore",
  "web3Store",
  "tierStore",
  "generalStore",
  "gasPriceStore",
  "reservedTokenStore",
  "deploymentStore",
  "tokenStore"
)
@observer
export class stepThree extends React.Component {
  constructor(props) {
    super(props);

    const { contractStore, gasPriceStore } = props;

    if (contractStore.crowdsale.addr.length > 0) {
      contractStore.setContractProperty("pricingStrategy", "addr", []);
      setExistingContractParams(contractStore.abi, contractStore.addr[0], contractStore.setContractProperty);
    }

    this.state = {
      loading: true,
      gasPriceSelected: gasPriceStore.slow.id,
      minCap: props.tierStore.globalMinCap || '',
      walletAddress: '',
      validation: {
        gasPrice: {
          pristine: true,
          valid: INVALID
        },
        minCap: {
          pristine: true,
          valid: VALID
        },
        walletAddress: {
          pristine: true,
          valid: INVALID
        }
      }
    }
  }

  componentDidMount () {
    const { gasPriceStore, tierStore } = this.props

    gasPriceStore.updateValues()
      .then(() => this.setGasPrice(gasPriceStore.slow))
      .catch(() => noGasPriceAvailable())
      .then(() => {
        if (this.props.tierStore.tiers.length === 0) {
          this.addCrowdsale()
        }
        this.setState({ loading: false })
        this.updateWalletAddress({
          address: tierStore.tiers[0].walletAddress,
          pristine: true,
          valid: VALID,
        })
        window.scrollTo(0, 0)
      })
  }

  showErrorMessages = () => {
    const { tierStore } = this.props

    tierStore.invalidateToken()
  }

  updateTierStore = (event, property, index) => {
    const { tierStore } = this.props
    const value = event.target.value

    tierStore.setTierProperty(value, property, index)
    tierStore.validateTiers(property, index)
  }

  addCrowdsale() {
    const { tierStore, web3Store } = this.props
    const { curAddress } = web3Store

    const num = tierStore.tiers.length
    const newTier = Object.assign({}, defaultTier)
    const newTierValidations = Object.assign({}, defaultTierValidations)

    newTier.tier = `Tier ${num + 1}`

    if (num === 0) {
      newTier.whitelistEnabled = "no"
      newTier.walletAddress = curAddress
    }

    tierStore.addTier(newTier, newTierValidations)
  }

  goToDeploymentStage = () => {
    this.props.history.push('/4')
  }

  beforeNavigate = e => {
    e.preventDefault()
    e.stopPropagation()

    const { tierStore, gasPriceStore } = this.props
    const gasPriceIsValid = gasPriceStore.custom.id !== this.state.gasPriceSelected || this.state.validation.gasPrice.valid === VALID
    const isMinCapLessThanMaxSupply = tierStore.globalMinCap <= tierStore.maxSupply
    const isMinCapValid = this.state.validation.minCap.valid === VALID

    for (let index = 0; index < tierStore.tiers.length; index++) {
      tierStore.validateTiers('endTime', index)
      tierStore.validateTiers('startTime', index)
    }

    if (!isMinCapLessThanMaxSupply) {
      this.setState(update(this.state, {
        validation: {
          minCap: {
            valid: { $set: INVALID }
          }
        }
      }))
    }

    if (tierStore.areTiersValid && gasPriceIsValid && isMinCapValid && isMinCapLessThanMaxSupply) {
      const { reservedTokenStore, deploymentStore } = this.props
      const tiersCount = tierStore.tiers.length
      const reservedCount = reservedTokenStore.tokens.length
      const hasWhitelist = tierStore.tiers[0].whitelistEnabled === 'yes'

      deploymentStore.initialize(!!reservedCount, hasWhitelist, tiersCount)

      getNetworkVersion()
        .then(networkID => {
          if (getNetWorkNameById(networkID) === CHAINS.MAINNET) {
            const { generalStore } = this.props
            const priceSelected = generalStore.gasPrice

            let whitelistCount = 0

            if (hasWhitelist) {
              whitelistCount = tierStore.tiers.reduce((total, tier) => {
                total += tier.whitelist.length
                return total
              }, 0)
            }

            return warningOnMainnetAlert(tiersCount, priceSelected, reservedCount, whitelistCount, this.goToDeploymentStage)
          }
          this.goToDeploymentStage()
        })
        .catch(error => {
          console.error(error)
          this.showErrorMessages(e)
        })
    } else {
      this.showErrorMessages(e)
    }
  }

  updateWalletAddress = ({ address, pristine, valid }) => {
    const newState = update(this.state, {
      walletAddress: { $set: address },
      validation: {
        walletAddress: {
          $set: {
            pristine,
            valid,
          },
        },
      },
    })

    this.setState(newState)
    this.props.tierStore.updateWalletAddress(address, valid)
  }

  updateMinCap = ({ value, pristine, valid }) => {
    const newState = update(this.state, {
      validation: {
        minCap: {
          $set: {
            pristine: pristine,
            valid: valid
          }
        }
      }
    })
    newState.minCap = value

    this.setState(newState)
    this.props.tierStore.setGlobalMinCap(value)
  }

  setGasPrice({ id, price }) {
    this.setState({
      gasPriceSelected: id
    })

    // Don't modify the price when choosing custom
    if (id !== this.props.gasPriceStore.custom.id) {
      this.props.generalStore.setGasPrice(price)
    }
  }

  updateGasPrice = ({value, pristine, valid}) => {
    const newState = update(this.state, {
      validation: {
        gasPrice: {
          $set: {
            pristine: pristine,
            valid: valid
          }
        }
      }
    })

    this.setState(newState)
    this.props.generalStore.setGasPrice(gweiToWei(value))
  }

  renderGasPriceInput() {
    const { generalStore, gasPriceStore } = this.props

    return (
      <div className="right">
        <label className="label">Gas Price</label>
        <div className="radios-inline">
          <label className="radio-inline">
            <input
              type="radio"
              checked={this.state.gasPriceSelected === gasPriceStore.slow.id}
              name="gas-price-option-slow"
              onChange={() => this.setGasPrice(gasPriceStore.slow)}
              value="slow"
            />
            <span className="title">{gasPriceStore.slowDescription}</span>
          </label>
        </div>
        <div className="radios-inline">
          <label className="radio-inline">
            <input
              type="radio"
              checked={this.state.gasPriceSelected === gasPriceStore.standard.id}
              name="gas-price-option-normal"
              onChange={() => this.setGasPrice(gasPriceStore.standard)}
              value="slow"
            />
            <span className="title">{gasPriceStore.standardDescription}</span>
          </label>
        </div>
        <div className="radios-inline">
          <label className="radio-inline">
            <input
              type="radio"
              checked={this.state.gasPriceSelected === gasPriceStore.fast.id}
              name="gas-price-option-fast"
              onChange={() => this.setGasPrice(gasPriceStore.fast)}
              value="slow"
            />
            <span className="title">{gasPriceStore.fastDescription}</span>
          </label>
        </div>
        <div className="radios-inline">
          <label className="radio-inline">
            <input
              type="radio"
              checked={this.state.gasPriceSelected === gasPriceStore.custom.id}
              name="gas-price-option-fast"
              onChange={() => this.setGasPrice(gasPriceStore.custom)}
              value="slow"
            />
            <span className="title">{gasPriceStore.customDescription}</span>
          </label>
        </div>

        {
          this.state.gasPriceSelected === gasPriceStore.custom.id ?
            <NumericInput
              style={{ display: 'inline-block' }}
              min={0.1}
              maxDecimals={9}
              acceptFloat={true}
              value={weiToGwei(generalStore.gasPrice)}
              pristine={this.state.validation.gasPrice.pristine}
              valid={this.state.validation.gasPrice.valid}
              errorMessage="Gas Price must be greater than 0.1 with up to 9 decimals"
              onValueUpdate={this.updateGasPrice}
            /> :
            null
        }

        <p className="description">Slow is cheap, fast is expensive</p>
      </div>
    );
  }

  updateWhitelistEnabled = (e) => {
    this.updateMinCap({ value: '', valid: VALID, pristine: false })
    this.updateTierStore(e, "whitelistEnabled", 0)
  }

  render() {
    const { tierStore } = this.props;

    const globalSettingsBlock = (
      <div>
        <div className="section-title">
          <p className="title">Global settings</p>
        </div>
        <div className="input-block-container">
          <AddressInput
            side="left"
            title={WALLET_ADDRESS}
            address={this.state.walletAddress}
            valid={this.state.validation.walletAddress.valid}
            pristine={this.state.validation.walletAddress.pristine}
            errorMessage={VALIDATION_MESSAGES.WALLET_ADDRESS}
            onChange={this.updateWalletAddress}
            description="Where the money goes after investors transactions. Immediately after each transaction. We
             recommend to setup a multisig wallet with hardware based signers."
          />
          {this.renderGasPriceInput()}
        </div>
        <div className="input-block-container">
          <NumericInput
            side="left"
            title={MINCAP}
            description='Minimum amount of tokens to buy. Not the minimal amount for every transaction: if minCap is 1 and a user already has 1 token from a previous transaction, they can buy any amount they want.'
            disabled={tierStore.tiers[0] && tierStore.tiers[0].whitelistEnabled === "yes"}
            min={0}
            acceptEmpty={true}
            acceptFloat={!!this.props.tokenStore.decimals}
            maxDecimals={this.props.tokenStore.decimals}
            value={this.state.minCap}
            pristine={this.state.validation.minCap.pristine}
            valid={this.state.validation.minCap.valid}
            errorMessage={VALIDATION_MESSAGES.MINCAP}
            onValueUpdate={this.updateMinCap}
          />
          <RadioInputField
            extraClassName="right"
            title={ENABLE_WHITELISTING}
            items={[{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }]}
            selectedItem={tierStore.tiers[0] && tierStore.tiers[0].whitelistEnabled}
            onChange={e => this.updateWhitelistEnabled(e)}
            description="Enables whitelisting. If disabled, anyone can participate in the crowdsale."
          />
        </div>
      </div>
    )

    return (
      <section className="steps steps_crowdsale-contract" ref="three">
        <StepNavigation activeStep={CROWDSALE_SETUP}/>
        <div className="steps-content container">
          <div className="about-step">
            <div className="step-icons step-icons_crowdsale-setup"/>
            <p className="title">Crowdsale setup</p>
            <p className="description">The most important and exciting part of the crowdsale process. Here you can
              define parameters of your crowdsale campaign.</p>
          </div>
          {globalSettingsBlock}
        </div>

        <div>
          { tierStore.tiers.map((tier, index) => <CrowdsaleBlock key={index} num={index}/>) }
        </div>

        <div className="button-container">
          <div onClick={() => this.addCrowdsale()} className="button button_fill_secondary">Add Tier</div>
          <Link onClick={e => this.beforeNavigate(e)} className="button button_fill" to="/4">Continue</Link>
        </div>

        <Loader show={this.state.loading}/>
      </section>
    )
  }
}
