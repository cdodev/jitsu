package storages

import (
	"errors"
	"fmt"
	"strings"

	"github.com/hashicorp/go-multierror"
	"github.com/jitsucom/jitsu/server/adapters"
	"github.com/jitsucom/jitsu/server/events"
	"github.com/jitsucom/jitsu/server/logging"
	"github.com/jitsucom/jitsu/server/schema"
	"github.com/jitsucom/jitsu/server/timestamp"
)

func dryRun(payload events.Event, processor *schema.Processor, tableHelper *TableHelper) ([]adapters.TableField, error) {
	batchHeader, event, err := processor.ProcessEvent(payload)
	if err != nil {
		return nil, err
	}

	tableSchema := tableHelper.MapTableSchema(batchHeader)
	var dryRunResponses []adapters.TableField

	for name, column := range tableSchema.Columns {
		dryRunResponses = append(dryRunResponses, adapters.TableField{Field: name, Type: column.SQLType, Value: event[name]})
	}

	return dryRunResponses, nil
}

func isConnectionError(err error) bool {
	return strings.Contains(err.Error(), "connection refused") ||
		strings.Contains(err.Error(), "EOF") ||
		strings.Contains(err.Error(), "write: broken pipe") ||
		strings.Contains(err.Error(), "context deadline exceeded") ||
		strings.Contains(err.Error(), "connection reset by peer") ||
		strings.Contains(err.Error(), "write: connection timed out")
}

// syncStoreImpl implements common behaviour used to storing chunk of pulled data to any storages with processing
func syncStoreImpl(storage Storage, overriddenDataSchema *schema.BatchHeader, objects []map[string]interface{}, timeIntervalValue string, cacheTable bool) error {
	if len(objects) == 0 {
		return nil
	}

	adapter, tableHelper := storage.getAdapters()

	flatDataPerTable, err := processData(storage, overriddenDataSchema, objects, timeIntervalValue)
	if err != nil {
		return err
	}

	deleteConditions := adapters.DeleteByTimeChunkCondition(timeIntervalValue)

	for _, flatData := range flatDataPerTable {
		table := tableHelper.MapTableSchema(flatData.BatchHeader)

		dbSchema, err := tableHelper.EnsureTable(storage.ID(), table, cacheTable)
		if err != nil {
			return err
		}

		start := timestamp.Now()
		if err = adapter.BulkUpdate(dbSchema, flatData.GetPayload(), deleteConditions); err != nil {
			return err
		}
		logging.Debugf("[%s] Inserted [%d] rows in [%.2f] seconds", storage.ID(), flatData.GetPayloadLen(), timestamp.Now().Sub(start).Seconds())
	}

	return nil
}

func processData(storage Storage, overriddenDataSchema *schema.BatchHeader, objects []map[string]interface{}, timeIntervalValue string) (map[string]*schema.ProcessedFile, error) {
	processor := storage.Processor()
	if processor == nil {
		return nil, fmt.Errorf("Storage '%v' of '%v' type was badly configured", storage.ID(), storage.Type())
	}

	//API Connectors sync
	if overriddenDataSchema != nil {
		flatDataPerTable, err := processor.ProcessPulledEvents(overriddenDataSchema.TableName, objects)
		if err != nil {
			return nil, err
		}

		if len(overriddenDataSchema.Fields) > 0 {
			// enrich overridden schema types
			flatDataPerTable[overriddenDataSchema.TableName].BatchHeader.Fields.OverrideTypes(overriddenDataSchema.Fields)
		}

		return flatDataPerTable, nil
	}

	//Update call with single object or bulk uploading
	flatDataPerTable, failedEvents, err := processor.ProcessEvents(timeIntervalValue, objects, map[string]bool{})
	if err != nil {
		return nil, err
	}

	if !failedEvents.IsEmpty() {
		for _, e := range failedEvents.Events {
			err = multierror.Append(err, errors.New(e.Error))
		}
		return nil, err
	}

	return flatDataPerTable, nil
}
