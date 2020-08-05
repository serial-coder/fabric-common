const path = require('path');
const logger = require('khala-logger/log4js').consoleLogger('CA core');
const FABRIC_CA_HOME = '/etc/hyperledger/fabric-ca-server';
const IdentityService = require('khala-fabric-admin/identityService');
exports.container = {
	FABRIC_CA_HOME,
	CONFIG: path.resolve(FABRIC_CA_HOME, 'fabric-ca-server-config.yaml'),
	caKey: path.resolve(FABRIC_CA_HOME, 'ca-key.pem'),
	caCert: path.resolve(FABRIC_CA_HOME, 'ca-cert.pem'),
	tlsCert: path.resolve(FABRIC_CA_HOME, 'tls-cert.pem')
};

const registerIfNotExist = async (caService, admin, {enrollmentID, enrollmentSecret, affiliation, role, attrs}) => {
	try {
		const identityService = new IdentityService(caService, admin);

		const secret = await identityService.create({
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

exports.register = registerIfNotExist;
exports.envBuilder = () => {
	return [
		'GODEBUG=netdns=go'
	];
};