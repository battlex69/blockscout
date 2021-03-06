import $ from 'jquery'
import ethNetProps from 'eth-net-props'
import { walletEnabled, connectToWallet, getCurrentAccount, hideConnectButton } from './write.js'
import { openErrorModal, openWarningModal, openSuccessModal, openModalWithMessage } from '../modals.js'
import '../../pages/address'

const WEI_MULTIPLIER = 10 ** 18

const loadFunctions = (element) => {
  const $element = $(element)
  const url = $element.data('url')
  const hash = $element.data('hash')
  const type = $element.data('type')
  const action = $element.data('action')

  $.get(
    url,
    { hash: hash, type: type, action: action },
    response => $element.html(response)
  )
    .done(function () {
      const $connectTo = $('[connect-to]')
      const $connect = $('[connect-metamask]')
      const $connectedTo = $('[connected-to]')
      const $reconnect = $('[re-connect-metamask]')
      const $connectedToAddress = $('[connected-to-address]')

      window.ethereum && window.ethereum.on('accountsChanged', function (accounts) {
        if (accounts.length === 0) {
          $connectTo.removeClass('hidden')
          $connect.removeClass('hidden')
          $connectedTo.addClass('hidden')
        } else {
          $connectTo.addClass('hidden')
          $connect.removeClass('hidden')
          $connectedTo.removeClass('hidden')
          $connectedToAddress.html(`<a href='/address/${accounts[0]}'>${accounts[0]}</a>`)
        }
      })

      hideConnectButton().then(({ shouldHide, account }) => {
        if (shouldHide && account) {
          $connectTo.addClass('hidden')
          $connect.removeClass('hidden')
          $connectedTo.removeClass('hidden')
          $connectedToAddress.html(`<a href='/address/${account}'>${account}</a>`)
        } else if (shouldHide) {
          $connectTo.removeClass('hidden')
          $connect.addClass('hidden')
          $connectedTo.addClass('hidden')
        } else {
          $connectTo.removeClass('hidden')
          $connect.removeClass('hidden')
          $connectedTo.addClass('hidden')
        }
      })

      $connect.on('click', () => {
        connectToWallet()
      })

      $reconnect.on('click', () => {
        connectToWallet()
      })

      $('[data-function]').each((_, element) => {
        readWriteFunction(element)
      })
    })
    .fail(function (response) {
      $element.html(response.statusText)
    })
}

const readWriteFunction = (element) => {
  const $element = $(element)
  const $form = $element.find('[data-function-form]')

  const $responseContainer = $element.find('[data-function-response]')

  $form.on('submit', (event) => {
    const action = $form.data('action')
    event.preventDefault()

    if (action === 'read') {
      const url = $form.data('url')
      const $functionName = $form.find('input[name=function_name]')
      const $methodId = $form.find('input[name=method_id]')
      const $functionInputs = $form.find('input[name=function_input]')

      const args = $.map($functionInputs, element => {
        return $(element).val()
      })

      const data = {
        function_name: $functionName.val(),
        method_id: $methodId.val(),
        args
      }

      $.get(url, data, response => $responseContainer.html(response))
    } else if (action === 'write') {
      const chainId = $form.data('chainId')
      walletEnabled()
        .then((isWalletEnabled) => {
          if (isWalletEnabled) {
            const functionName = $form.find('input[name=function_name]').val()

            const $functionInputs = $form.find('input[name=function_input]')
            const $functionInputsExceptTxValue = $functionInputs.filter(':not([tx-value])')
            const args = $.map($functionInputsExceptTxValue, element => $(element).val())

            const $txValue = $functionInputs.filter('[tx-value]:first')

            const txValue = $txValue && $txValue.val() && parseFloat($txValue.val()) * WEI_MULTIPLIER

            const contractAddress = $form.data('contract-address')
            const implementationAbi = $form.data('implementation-abi')
            const parentAbi = $form.data('contract-abi')
            const $parent = $('[data-smart-contract-functions]')
            const contractType = $parent.data('type')
            const contractAbi = contractType === 'proxy' ? implementationAbi : parentAbi

            window.web3.eth.getChainId()
              .then(chainIdFromWallet => {
                if (chainId !== chainIdFromWallet) {
                  const networkDisplayNameFromWallet = ethNetProps.props.getNetworkDisplayName(chainIdFromWallet)
                  const networkDisplayName = ethNetProps.props.getNetworkDisplayName(chainId)
                  return Promise.reject(new Error(`You connected to ${networkDisplayNameFromWallet} chain in the wallet, but the current instance of Blockscout is for ${networkDisplayName} chain`))
                } else {
                  return getCurrentAccount()
                }
              })
              .then(currentAccount => {
                let methodToCall

                if (functionName) {
                  const TargetContract = new window.web3.eth.Contract(contractAbi, contractAddress)
                  methodToCall = TargetContract.methods[functionName](...args).send({ from: currentAccount, value: txValue || 0 })
                } else {
                  const txParams = {
                    from: currentAccount,
                    to: contractAddress,
                    value: txValue || 0
                  }
                  methodToCall = window.web3.eth.sendTransaction(txParams)
                }

                methodToCall
                  .on('error', function (error) {
                    openErrorModal(`Error in sending transaction for method "${functionName}"`, formatError(error), false)
                  })
                  .on('transactionHash', function (txHash) {
                    openModalWithMessage($element.find('#pending-contract-write'), true, txHash)
                    const getTxReceipt = (txHash) => {
                      window.web3.eth.getTransactionReceipt(txHash)
                        .then(txReceipt => {
                          if (txReceipt) {
                            openSuccessModal('Success', `Successfully sent <a href="/tx/${txHash}">transaction</a> for method "${functionName}"`)
                            clearInterval(txReceiptPollingIntervalId)
                          }
                        })
                    }
                    const txReceiptPollingIntervalId = setInterval(() => { getTxReceipt(txHash) }, 5 * 1000)
                  })
              })
              .catch(error => {
                openWarningModal('Unauthorized', formatError(error))
              })
          } else {
            openWarningModal('Unauthorized', 'You haven\'t approved the reading of account list from your MetaMask or MetaMask/Nifty wallet is locked or is not installed.')
          }
        })
    }
  })
}

const formatError = (error) => {
  let { message } = error
  message = message && message.split('Error: ').length > 1 ? message.split('Error: ')[1] : message
  return message
}

const container = $('[data-smart-contract-functions]')

if (container.length) {
  loadFunctions(container)
}
