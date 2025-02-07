// @Libs
import { useCallback, useMemo } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Collapse, Form } from 'antd';
import snakeCase from 'lodash/snakeCase';
// @Store
import { sourcesStore } from 'stores/sources';
// @Hooks
import useLoader from 'hooks/useLoader';
// @Services
import ApplicationServices from 'lib/services/ApplicationServices';
// @Utils
import { sourcePageUtils } from 'ui/pages/SourcesPage/SourcePage.utils';
import { destinationEditorUtils } from 'ui/pages/DestinationsPage/partials/DestinationEditor/DestinationEditor.utils';
// @Components
import {
  NameWithPicture,
  ConnectedItems,
  ConnectedItem
} from 'ui/components/ConnectedItems/ConnectedItems';
import { CenteredError, CenteredSpin } from 'lib/components/components';
import { TabDescription } from 'ui/components/Tabs/TabDescription';
// @Types
import { FormInstance } from 'antd/lib/form/hooks/useForm';
import { Destination } from 'catalog/destinations/types';
// @Catalog sources
import { allSources } from 'catalog/sources/lib';
// @Constants
import { DESTINATIONS_CONNECTED_SOURCES } from 'embeddedDocs/destinationsConnectedItems';
import { observer } from 'mobx-react-lite';

export interface Props {
  form: FormInstance;
  destination: Destination;
  initialValues: DestinationData;
  handleTouchAnyField: (...args: any) => void;
}

const DestinationEditorConnectorsComponent = ({
  form,
  initialValues,
  destination,
  handleTouchAnyField
}: Props) => {
  const service = ApplicationServices.get();

  const sources = sourcesStore.sources;
  const sourcesError = sourcesStore.error;

  const [apiKeysError, apiKeysData] = useLoader(
    async () =>
      await service.storageService.get('api_keys', service.activeProject.id)
  );

  const sourcesList = useMemo<ConnectedItem[]>(
    () =>
      sources
        ? sources?.map((src: SourceData) => {
            const proto = allSources.find(
              (s) => snakeCase(s.id) === snakeCase(src.sourceProtoType)
            );

            return {
              id: src.sourceId,
              title: (
                <>
                  <NameWithPicture icon={proto?.pic}>
                    <b>{proto?.displayName}: </b>{' '}
                    {sourcePageUtils.getTitle(src)}
                  </NameWithPicture>
                </>
              ),
              description: null
            };
          })
        : [],
    [sources]
  );

  const apiKeysList = useMemo<ConnectedItem[]>(
    () =>
      apiKeysData?.keys
        ? apiKeysData.keys.map((key: APIKey) => ({
            title: (
              <>
                <code>{key.uid}</code>
                {key.comment && (
                  <span className="pl-2 text-secondaryText">
                    (<b>Note:</b> {key.comment})
                  </span>
                )}
              </>
            ),
            id: key.uid,
            description: (
              <div className="align-middle">
                Server secret: <code>{key.serverAuth}</code> / Client secret:{' '}
                <code>{key.jsAuth}</code>
              </div>
            )
          }))
        : [],
    [apiKeysData?.keys]
  );

  const handleItemChange = useCallback(
    (name: string) => (items: string[]) => {
      const beenTouched =
        JSON.stringify(items) !== JSON.stringify(initialValues?.[name]);

      handleTouchAnyField(beenTouched);
    },
    [initialValues, handleTouchAnyField]
  );

  if (apiKeysError || sourcesError) {
    return <CenteredError error={apiKeysError || sourcesError} />;
  } else if (!apiKeysData) {
    return <CenteredSpin />;
  }

  let activeKey;
  if (
    apiKeysList?.length > 0 ||
    (sources?.length === 0 && apiKeysList?.length === 0)
  ) {
    activeKey = 'keys';
  } else {
    activeKey = 'connectors';
  }

  return (
    <>
      <Form form={form} name="connected-sources">
        <TabDescription>{DESTINATIONS_CONNECTED_SOURCES}</TabDescription>

        <Collapse ghost defaultActiveKey={activeKey}>
          <Collapse.Panel
            header={
              <b>
                Linked API Keys (<NavLink to="/api_keys">edit API keys</NavLink>
                )
              </b>
            }
            key="keys"
            forceRender
          >
            <div className="pl-6">
              <ConnectedItems
                form={form}
                fieldName="_onlyKeys"
                itemsList={apiKeysList}
                warningMessage={<p>Please, choose at least one API key.</p>}
                initialValues={initialValues?._onlyKeys}
                handleItemChange={handleItemChange('_onlyKeys')}
              />
            </div>
          </Collapse.Panel>
          <Collapse.Panel
            header={
              <b>
                Linked Connectors (
                <NavLink to="/sources">edit connectors</NavLink>)
              </b>
            }
            key="connectors"
            forceRender
          >
            <div className="pl-6">
              {destination.syncFromSourcesStatus === 'supported' &&
                sources?.length === 0 && (
                  <p className="text-sm text-secondaryText">
                    You don't have any connectors you can link to the
                    destination. You can add them{' '}
                    <Link to="/sources">here</Link>.
                  </p>
                )}
              {destination.syncFromSourcesStatus === 'supported' && (
                <ConnectedItems
                  form={form}
                  fieldName="_sources"
                  itemsList={sourcesList}
                  warningMessage={<p>Please, choose at least one source.</p>}
                  initialValues={initialValues?._sources}
                  handleItemChange={handleItemChange('_sources')}
                />
              )}
              {destination.syncFromSourcesStatus === 'coming_soon' && (
                <div className="text-secondaryText">
                  <b>{destination.displayName}</b> support is{' '}
                  <i>coming soon!</i>. At the moment, Jitsu can't send data from
                  connectors to {destination.displayName}. However, you can
                  event streaming is available!
                </div>
              )}
              {destination.syncFromSourcesStatus === 'not_supported' && (
                <div className="text-secondaryText">
                  Jitsu can't send data from connectors to{' '}
                  <b>{destination.displayName}</b> due to limitations of the API
                </div>
              )}
            </div>
          </Collapse.Panel>
        </Collapse>
      </Form>
    </>
  );
};

const DestinationEditorConnectors = observer(
  DestinationEditorConnectorsComponent
);

DestinationEditorConnectors.displayName = 'DestinationEditorConnectors';

export { DestinationEditorConnectors };
