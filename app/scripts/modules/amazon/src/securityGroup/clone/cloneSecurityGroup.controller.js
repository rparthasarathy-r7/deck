'use strict';

const angular = require('angular');
import _ from 'lodash';

import { AccountService, FirewallLabels } from '@spinnaker/core';

import { VPC_READ_SERVICE } from 'amazon/vpc/vpc.read.service';

module.exports = angular
  .module('spinnaker.amazon.securityGroup.clone.controller', [
    VPC_READ_SERVICE,
    require('../configure/configSecurityGroup.mixin.controller.js').name,
  ])
  .controller('awsCloneSecurityGroupController', function(
    $scope,
    $uibModalInstance,
    $controller,
    securityGroup,
    application,
  ) {
    var vm = this;

    vm.firewallLabel = FirewallLabels.get('Firewall');

    $scope.pages = {
      location: require('../configure/createSecurityGroupProperties.html'),
      ingress: require('../configure/createSecurityGroupIngress.html'),
    };

    securityGroup.credentials = securityGroup.accountName;
    $scope.namePreview = securityGroup.name;

    angular.extend(
      this,
      $controller('awsConfigSecurityGroupMixin', {
        $scope: $scope,
        $uibModalInstance: $uibModalInstance,
        application: application,
        securityGroup: securityGroup,
      }),
    );

    AccountService.listAccounts('aws').then(function(accounts) {
      $scope.accounts = accounts;
      vm.accountUpdated();
    });

    securityGroup.securityGroupIngress = _.chain(securityGroup.inboundRules)
      .filter(function(rule) {
        return rule.securityGroup;
      })
      .map(function(rule) {
        return rule.portRanges.map(function(portRange) {
          return {
            name: rule.securityGroup.name,
            type: rule.protocol,
            startPort: portRange.startPort,
            endPort: portRange.endPort,
          };
        });
      })
      .flatten()
      .value();

    securityGroup.ipIngress = _.chain(securityGroup.inboundRules)
      .filter(function(rule) {
        return rule.range;
      })
      .map(function(rule) {
        return rule.portRanges.map(function(portRange) {
          return {
            cidr: rule.range.ip + rule.range.cidr,
            type: rule.protocol,
            startPort: portRange.startPort,
            endPort: portRange.endPort,
          };
        });
      })
      .flatten()
      .value();

    vm.upsert = function() {
      vm.mixinUpsert('Clone');
    };

    vm.initializeSecurityGroups();
  });
