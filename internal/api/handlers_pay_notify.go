package api

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (s *Server) handleEpayNotify(c *gin.Context) {
	params := map[string]string{}
	for k, vals := range c.Request.URL.Query() {
		if len(vals) > 0 {
			params[k] = vals[0]
		}
	}
	if c.Request.Method == http.MethodPost {
		_ = c.Request.ParseForm()
		for k, vals := range c.Request.PostForm {
			if len(vals) > 0 {
				params[k] = vals[0]
			}
		}
	}

	orderNo, tradeNo, err := s.paySvc.VerifyEpayNotify(params)
	if err != nil {
		c.String(http.StatusBadRequest, "fail: "+err.Error())
		return
	}
	if err := s.paySvc.FulfillOrder(c.Request.Context(), orderNo, tradeNo); err != nil {
		c.String(http.StatusInternalServerError, "fail: "+err.Error())
		return
	}
	c.String(http.StatusOK, "success")
}

func (s *Server) handleAlipayNotify(c *gin.Context) {
	_ = c.Request.ParseForm()
	params := map[string]string{}
	for k, vals := range c.Request.PostForm {
		if len(vals) > 0 {
			params[k] = vals[0]
		}
	}

	orderNo, tradeNo, err := s.paySvc.VerifyAlipayNotify(params)
	if err != nil {
		c.String(http.StatusBadRequest, "failure")
		return
	}
	if err := s.paySvc.FulfillOrder(c.Request.Context(), orderNo, tradeNo); err != nil {
		c.String(http.StatusInternalServerError, "failure")
		return
	}
	c.String(http.StatusOK, "success")
}

func (s *Server) handleWechatNotify(c *gin.Context) {
	var body struct {
		EventType string `json:"event_type"`
		Resource  struct {
			Ciphertext     string `json:"ciphertext"`
			Nonce          string `json:"nonce"`
			AssociatedData string `json:"associated_data"`
		} `json:"resource"`
	}
	raw, _ := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err := unmarshalJSON(raw, &body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "invalid body"})
		return
	}
	if body.EventType != "TRANSACTION.SUCCESS" {
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "ignored"})
		return
	}
	orderNo, tradeNo, err := s.paySvc.DecryptWechatNotifyResource(body.Resource.Ciphertext, body.Resource.Nonce, body.Resource.AssociatedData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": err.Error()})
		return
	}
	if err := s.paySvc.FulfillOrder(c.Request.Context(), orderNo, tradeNo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "OK"})
}
