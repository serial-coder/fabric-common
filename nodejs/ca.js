const path = require('path');
const logger = require('./logger').new('CA core');
const CAClient = require('fabric-ca-client/lib/FabricCAServices');
const fsExtra = require('fs-extra');
const FABRIC_CA_HOME = '/etc/hyperledger/fabric-ca-server';
const identityServiceUtil = require('./identityService');
const ClientUtil = require('./client');
exports.container = {
	FABRIC_CA_HOME,
	CONFIG: path.resolve(FABRIC_CA_HOME, 'fabric-ca-server-config.yaml'),
	caKey: path.resolve(FABRIC_CA_HOME, 'ca-key.pem'),
	caCert: path.resolve(FABRIC_CA_HOME, 'ca-cert.pem'),
	tlsCert: path.resolve(FABRIC_CA_HOME, 'tls-cert.pem')
};

const registerIfNotExist = async (caService, admin, {enrollmentID, enrollmentSecret, affiliation, role, attrs}) => {
	try {
		const identityService = identityServiceUtil.new(caService);

		const secret = await identityServiceUtil.create(identityService, admin, {
			enrollmentID, enrollmentSecret, affiliation, role, attrs
		});
		if (!enrollmentSecret) {
			logger.info({affiliation}, 'new enrollmentSecret generated by ca service');
			return {enrollmentID, enrollmentSecret: secret, status: 'generated'};
		} else {
			return {enrollmentID, enrollmentSecret, status: 'assigned'};
		}
	} catch (err) {
		logger.warn(err.toString());
		if (err.toString().includes('is already registered')) {
			return {enrollmentID, enrollmentSecret, status: 'existed'};
		} else {
			throw err;
		}
	}
};
//TODO e2e test
exports.intermediateCA = {
	register: async (caService, admin, {enrollmentID, enrollmentSecret, affiliation}) => {
		return await registerIfNotExist(caService, admin, {
			enrollmentID, enrollmentSecret,
			affiliation, role: 'user',
			attrs: [{name: 'hf.IntermediateCA', value: 'true'}]
		});
	}
};
const ECDSAPRIV = require('./key');
const pkcs11KeySave = (filePath, key) => {
	const ecdsaKey = new ECDSAPRIV(key);
	fsExtra.outputFileSync(filePath, ecdsaKey.pem());
};
exports.pkcs11_key = {
	generate: (cryptoSuite) => cryptoSuite.generateKey({ephemeral: !cryptoSuite._cryptoKeyStore}),
	toKeystore: (dirName, key) => {
		const ecdsaKey = new ECDSAPRIV(key);
		const filename = ecdsaKey.filename();
		const absolutePath = path.resolve(dirName, filename);
		pkcs11KeySave(absolutePath, key);
	},
	save: pkcs11KeySave
};

exports.register = registerIfNotExist;
/**
 *
 * @param {string} caUrl
 * @param {CertificatePem[]} trustedRoots tlsca for connection
 * @param {CryptoSuite} cryptoSuite
 * @returns {FabricCAServices}
 */
exports.new = (caUrl, trustedRoots = [], cryptoSuite = ClientUtil.newCryptoSuite()) => {
	const tlsOptions = {
		trustedRoots,
		verify: trustedRoots.length > 0
	};
	return new CAClient(caUrl, tlsOptions, '', cryptoSuite);
};
exports.envBuilder = () => {
	return [
		'GODEBUG=netdns=go'
	];
};
exports.toString = (caService) => {
	const caClient = caService._fabricCAClient;
	const returned = {
		caName: caClient._caName,
		hostname: caClient._hostname,
		port: caClient._port
	};
	const trustedRoots = caClient._tlsOptions.trustedRoots.map(buffer => buffer.toString());
	returned.tlsOptions = {
		trustedRoots,
		verify: caClient._tlsOptions.verify
	};

	return JSON.stringify(returned);
};