import { IController, IPromise, IQService, module } from 'angular';
import { cloneDeep, flattenDeep } from 'lodash';

import {
  Application,
  CONFIRMATION_MODAL_SERVICE,
  ConfirmationModalService,
  INSTANCE_READ_SERVICE,
  INSTANCE_WRITE_SERVICE,
  InstanceReader,
  InstanceWriter,
  RecentHistoryService,
} from '@spinnaker/core';

import { IAppengineInstance } from 'appengine/domain';

interface InstanceFromStateParams {
  instanceId: string;
}

interface InstanceManager {
  account: string;
  region: string;
  category: string; // e.g., serverGroup, loadBalancer.
  name: string; // Parent resource name, not instance name.
  instances: IAppengineInstance[];
}

class AppengineInstanceDetailsController implements IController {
  public state = { loading: true };
  public instance: IAppengineInstance;
  public instanceIdNotFound: string;
  public upToolTip = "An App Engine instance is 'Up' if a load balancer is directing traffic to its server group.";
  public outOfServiceToolTip = `
    An App Engine instance is 'Out Of Service' if no load balancers are directing traffic to its server group.`;

  constructor(
    private $q: IQService,
    private app: Application,
    private instanceReader: InstanceReader,
    private instanceWriter: InstanceWriter,
    private confirmationModalService: ConfirmationModalService,
    instance: InstanceFromStateParams,
  ) {
    'ngInject';

    this.app
      .ready()
      .then(() => this.retrieveInstance(instance))
      .then(instanceDetails => {
        this.instance = instanceDetails;
        this.state.loading = false;
      })
      .catch(() => {
        this.instanceIdNotFound = instance.instanceId;
        this.state.loading = false;
      });
  }

  public terminateInstance(): void {
    const instance = cloneDeep(this.instance) as any;
    const shortName = `${this.instance.name.substring(0, 10)}...`;
    instance.placement = {};
    instance.instanceId = instance.name;

    const taskMonitor = {
      application: this.app,
      title: 'Terminating ' + shortName,
      onTaskComplete() {
        if (this.$state.includes('**.instanceDetails', { instanceId: instance.name })) {
          this.$state.go('^');
        }
      },
    };

    const submitMethod = () => {
      return this.instanceWriter.terminateInstance(instance, this.app, { cloudProvider: 'appengine' });
    };

    this.confirmationModalService.confirm({
      header: 'Really terminate ' + shortName + '?',
      buttonText: 'Terminate ' + shortName,
      account: instance.account,
      taskMonitorConfig: taskMonitor,
      submitMethod,
    });
  }

  private retrieveInstance(instance: InstanceFromStateParams): IPromise<IAppengineInstance> {
    const instanceLocatorPredicate = (dataSource: InstanceManager) => {
      return dataSource.instances.some(possibleMatch => possibleMatch.id === instance.instanceId);
    };

    const dataSources: InstanceManager[] = flattenDeep([
      this.app.getDataSource('serverGroups').data,
      this.app.getDataSource('loadBalancers').data,
      this.app.getDataSource('loadBalancers').data.map(loadBalancer => loadBalancer.serverGroups),
    ]);

    const instanceManager = dataSources.find(instanceLocatorPredicate);

    if (instanceManager) {
      const recentHistoryExtraData: { [key: string]: string } = {
        region: instanceManager.region,
        account: instanceManager.account,
      };
      if (instanceManager.category === 'serverGroup') {
        recentHistoryExtraData.serverGroup = instanceManager.name;
      }
      RecentHistoryService.addExtraDataToLatest('instances', recentHistoryExtraData);

      return this.instanceReader
        .getInstanceDetails(instanceManager.account, instanceManager.region, instance.instanceId)
        .then((instanceDetails: IAppengineInstance) => {
          instanceDetails.account = instanceManager.account;
          instanceDetails.region = instanceManager.region;
          return instanceDetails;
        });
    } else {
      return this.$q.reject();
    }
  }
}

export const APPENGINE_INSTANCE_DETAILS_CTRL = 'spinnaker.appengine.instanceDetails.controller';

module(APPENGINE_INSTANCE_DETAILS_CTRL, [
  INSTANCE_READ_SERVICE,
  INSTANCE_WRITE_SERVICE,
  CONFIRMATION_MODAL_SERVICE,
]).controller('appengineInstanceDetailsCtrl', AppengineInstanceDetailsController);
