package main

import (
	"errors"
	"github.com/maz/kvs"
	"labix.org/v2/mgo"
	"labix.org/v2/mgo/bson"
	"log"
	"os"
)

type mongoStore struct {
	col  *mgo.Collection
	sess *mgo.Session
}

func NewBackingStore() kvs.KeyValueStore {
	store := new(mongoStore)
	url := os.Getenv("MONGO_URL")
	if url == "" {
		url = "localhost"
	}
	mongo, err := mgo.Dial(url)
	if err != nil {
		log.Panic(err)
	}
	store.sess = mongo
	db := mongo.DB("emfields")
	store.col = db.C("kvs")
	err = store.col.EnsureIndexKey("key")
	if err != nil {
		log.Panic(err)
	}
	log.Printf("Opened Database")
	return store
}

func (m *mongoStore) Get(key string) ([]byte, error) {
	entry := make(bson.M)
	err := m.col.Find(bson.M{"key": key}).One(&entry)
	if err != nil && err != mgo.ErrNotFound {
		return nil, err
	}
	if entry == nil {
		return nil, &kvs.KeyNotFoundError{key}
	}
	data, ok := entry["data"].([]byte)
	if !ok {
		panic(errors.New("Can't cast interface{} to []byte"))
	}
	return data, nil
}

func (m *mongoStore) Set(key string, data []byte) error {
	_, err := m.col.Upsert(bson.M{"key": key}, bson.M{"data": data, "key": key})
	return err
}

func (m *mongoStore) Delete(key string) error {
	return m.col.Remove(bson.M{"key": key})
}

func (m *mongoStore) Close() error {
	m.sess.Close()
	return nil
}
