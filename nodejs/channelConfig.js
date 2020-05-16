const logger = require('khala-logger/log4js').consoleLogger('channel-config');

const ConfigtxlatorServer = require('./configtxlator');
const configtxlatorServer = new ConfigtxlatorServer();
const {getChannelConfigFromOrderer} = require('./channel');
const BinManager = require('./binManager');
const {ConfigtxlatorType} = require('khala-fabric-formatter/configtxlator');
const ConfigFactory = require('khala-fabric-formatter/configFactory');
const ChannelUpdate = require('khala-fabric-admin/channelUpdate');
const SigningIdentityUtil = require('khala-fabric-admin/signingIdentity');
/**
 * @param {string} channelName
 * @param {Client.User} user
 * @param {Orderer} orderer
 * @param {boolean} [viaServer]
 *  true: This requires 'configtxlator' RESTful server running locally on port 7059
 *  false: use 'configtxlator' as command line tool
 * @returns {Promise<{proto: protoMessage, json: string}>}
 */
const getChannelConfigReadable = async (channelName, user, orderer, viaServer) => {

	const configEnvelope = await getChannelConfigFromOrderer(channelName, user, orderer);
	const proto = configEnvelope.config;

	let json;
	if (viaServer) {
		const body = await configtxlatorServer.decode(ConfigtxlatorType.Config, proto.toBuffer());
		json = JSON.stringify(body);
	} else {
		const binManager = new BinManager();
		json = await binManager.configtxlatorCMD.decode(ConfigtxlatorType.Config, proto.toBuffer());
	}

	return {
		proto,
		json
	};
};

const setAnchorPeers = async (channelName, orderer, user, signingIdentities = [], orgName, anchorPeers, viaServer) => {

	const channelUpdate = new ChannelUpdate(channelName, user, orderer.committer, logger);
	const {proto, json} = await getChannelConfigReadable(channelName, user, orderer, viaServer);
	const configFactory = new ConfigFactory(json, logger);

	configFactory.setAnchorPeers(orgName, anchorPeers);
	const updateConfigJSON = configFactory.build();

	let config;
	if (viaServer) {
		const updatedProto = await configtxlatorServer.encode(ConfigtxlatorType.Config, updateConfigJSON);
		config = await configtxlatorServer.computeUpdate(channelName, proto.toBuffer(), updatedProto);
	} else {

		const binManager = new BinManager();
		const updatedProto = await binManager.configtxlatorCMD.encode(ConfigtxlatorType.Config, updateConfigJSON);
		config = await binManager.configtxlatorCMD.computeUpdate(channelName, proto.toBuffer(), updatedProto);

	}

	const mainSigningIdentity = user.getSigningIdentity();
	if (signingIdentities.length === 0) {
		signingIdentities.push(mainSigningIdentity);
	}
	const signatures = [];
	for (const signingIdentity of signingIdentities) {
		const extraSigningIdentityUtil = new SigningIdentityUtil(signingIdentity);
		signatures.push(extraSigningIdentityUtil.signChannelConfig(config).toBuffer());
	}
	channelUpdate.useSignatures(config, signatures);
	return await channelUpdate.submit();

};


module.exports = {
	getChannelConfigReadable,
	setAnchorPeers
};